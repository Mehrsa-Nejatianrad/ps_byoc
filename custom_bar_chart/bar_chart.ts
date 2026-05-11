import {
    ChartToTSEvent,
    ColumnType,
    getChartContext,
    CustomChartContext,
    ChartModel,
    ChartConfig,
    DataPointsArray,
    Query,
} from '@thoughtspot/ts-chart-sdk';
import numeral from 'numeral';

// Highcharts + waterfall module loaded via CDN script tags in index.html
declare const Highcharts: any;

interface VisualProps {
    numberFormat?: string;
    colorPositive?: string;
    colorNegative?: string;
    colorTotal?: string;
    showDataLabels?: boolean;
}

let globalChartReference: any = null;

function formatNumber(value: number, format: string): string {
    try {
        return numeral(value).format(format).replace('k', 'K').replace('m', 'M').replace('b', 'B');
    } catch {
        return value?.toString() ?? '0';
    }
}

/**
 * Column index mapping — no stagename or date in query:
 *   0 = Original Renewal ARR Converted
 *   1 = Indexation ARR Converted
 *   2 = Renewal Uplift ARR Converted
 *   3 = Discounts ARR Converted  (positive number = reduction)
 *   4 = Net Solutions ARR Converted
 *   5 = Renewed ARR Converted
 *   6 = Cumulative Indexation ARR Converted
 */
function getDataModel(chartModel: ChartModel) {
    const dataArr: DataPointsArray =
        chartModel.data?.[chartModel.data.length - 1]?.data ?? { columns: [], dataValue: [] };

    let orig = 0, idx = 0, uplift = 0, disc = 0, sol = 0, renewed = 0, cumIdx = 0;

    dataArr.dataValue.forEach((row) => {
        orig    += parseFloat(String(row[0] ?? 0)) || 0;
        idx     += parseFloat(String(row[1] ?? 0)) || 0;
        uplift  += parseFloat(String(row[2] ?? 0)) || 0;
        disc    += parseFloat(String(row[3] ?? 0)) || 0;
        sol     += parseFloat(String(row[4] ?? 0)) || 0;
        renewed += parseFloat(String(row[5] ?? 0)) || 0;
        cumIdx  += parseFloat(String(row[6] ?? 0)) || 0;
    });

    const cols = chartModel.columns ?? [];
    const colName = (i: number) => cols[i]?.name ?? '';

    return {
        orig, idx, uplift, disc, sol, renewed, cumIdx,
        colNames: {
            orig:    colName(0) || 'Original Renewal ARR',
            idx:     colName(1) || 'Indexation ARR',
            uplift:  colName(2) || 'Renewal Uplift ARR',
            disc:    colName(3) || 'Discounts ARR',
            sol:     colName(4) || 'Net Solutions ARR',
            renewed: colName(5) || 'Renewed ARR',
            cumIdx:  colName(6) || 'Cumulative Indexation ARR',
        },
    };
}

function render(ctx: CustomChartContext) {
    const chartModel = ctx.getChartModel();
    const dm = getDataModel(chartModel);
    const visualProps = (chartModel.visualProps ?? {}) as VisualProps;

    const numberFormat  = visualProps.numberFormat  ?? '0.[0]a';
    const colorPositive = visualProps.colorPositive ?? '#378ADD';
    const colorNegative = visualProps.colorNegative ?? '#E24B4A';
    const colorTotal    = visualProps.colorTotal    ?? '#534AB7';
    const showDataLabels = visualProps.showDataLabels ?? true;

    const { orig, idx, uplift, disc, sol, renewed, cumIdx, colNames } = dm;

    // How Highcharts waterfall works:
    // - Each bar's y is a DELTA added to the running total
    // - isSum: true means "draw a total bar = sum of all previous deltas" (ignores y value)
    // - isIntermediateSum: true does the same but resets for subsequent bars
    //
    // Strategy:
    // - Original Renewal: y = orig (first bar, running total starts at 0, goes to orig) ✓
    // - Cumulative Indexation: y = cumIdx (delta added on top of orig)
    // - Indexation: y = idx
    // - Renewal Uplift: y = uplift
    // - Net Solutions: y = sol
    // - Discounts: y = -disc (negative delta, bar goes down)
    // - Renewed ARR: isSum = true (Highcharts sums all deltas = orig+cumIdx+idx+uplift+sol-disc)
    //
    // BUT: Renewed ARR from the data is a fixed value that may differ from the sum of components.
    // So instead of isSum, we compute the gap needed and use an adjustment delta.

    const computedTotal = orig + cumIdx + idx + uplift + sol - Math.abs(disc);
    const renewedDelta = renewed - computedTotal; // adjustment so final bar lands on renewed

    const waterfallData: any[] = [
        {
            name: colNames.orig,
            y: orig,
            color: colorTotal,
        },
        {
            name: colNames.cumIdx,
            y: cumIdx,
            color: colorPositive,
        },
        {
            name: colNames.idx,
            y: idx,
            color: colorPositive,
        },
        {
            name: colNames.uplift,
            y: uplift,
            color: colorPositive,
        },
        {
            name: colNames.sol,
            y: sol,
            color: colorPositive,
        },
        {
            name: colNames.disc,
            y: -Math.abs(disc),
            color: colorNegative,
        },
        // Use isSum so Highcharts draws it as a full bar from zero
        // and override its displayed label with the actual renewed value
        {
            name: colNames.renewed,
            isSum: true,
            color: colorTotal,
        },
    ];

    if (globalChartReference) {
        globalChartReference.destroy();
        globalChartReference = null;
    }

    globalChartReference = Highcharts.chart('chart', {
        chart: { type: 'waterfall' },
        title: { text: '' },
        credits: { enabled: false },

        xAxis: {
            type: 'category',
            lineWidth: 0,
            gridLineWidth: 0,
            labels: { style: { fontWeight: 'bold', color: '#333' } },
            title: {
                text: 'ARR Components',
                style: { fontWeight: 'bold', color: '#000' },
            },
        },

        yAxis: {
            title: {
                text: 'ARR (EUR)',
                style: { fontWeight: 'bold', color: '#000' },
            },
            gridLineWidth: 1,
            labels: {
                formatter: function (this: any) {
                    return formatNumber(this.value, numberFormat);
                },
            },
        },

        legend: { enabled: false },

        tooltip: {
            backgroundColor: '#3A3F48',
            borderColor: '#FFD700',
            borderRadius: 4,
            borderWidth: 1,
            style: { color: '#FFFFFF', fontSize: '12px' },
            useHTML: true,
            formatter: function (this: any) {
                const point = this.point;
                // For isSum bars, cumulative = the sum; for delta bars use Math.abs(y)
                const displayVal = point.isSum
                    ? formatNumber(point.cumulative ?? 0, numberFormat)
                    : formatNumber(Math.abs(this.y ?? 0), numberFormat);
                const running = formatNumber(point.cumulative ?? 0, numberFormat);
                return `
                    <b>${this.key}</b><br/>
                    <b>Value:</b> ${displayVal}<br/>
                    <b>Running total:</b> ${running}
                `;
            },
        },

        plotOptions: {
            waterfall: {
                lineWidth: 1,
                lineColor: '#aaa',
                borderWidth: 0,
                pointPadding: 0.1,
                groupPadding: 0.1,
                dataLabels: {
                    enabled: showDataLabels,
                    style: {
                        fontWeight: '500',
                        fontSize: '11px',
                        color: '#fff',
                        textOutline: '1px rgba(0,0,0,0.3)',
                    },
                    formatter: function (this: any) {
                        const point = this.point;
                        // Show the cumulative total for isSum bars, delta for others
                        if (point.isSum) {
                            return formatNumber(point.cumulative ?? 0, numberFormat);
                        }
                        return formatNumber(Math.abs(this.y ?? 0), numberFormat);
                    },
                },
                point: {
                    events: {
                        contextmenu: function (e: MouseEvent) {
                            e.preventDefault();
                            const point = this as any;
                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: { clientX: e.clientX, clientY: e.clientY },
                                clickedPoint: {
                                    tuple: [
                                        { columnId: chartModel.columns?.[0]?.id ?? '', value: point.name },
                                        { columnId: chartModel.columns?.[5]?.id ?? '', value: point.y },
                                    ],
                                },
                            });
                        },
                    },
                },
            },
        },

        series: [
            {
                type: 'waterfall',
                name: 'ARR Waterfall',
                data: waterfallData,
                upColor: colorPositive,
                color: colorNegative,
                showInLegend: false,
            },
        ],
    });
}

const renderChart = async (ctx: CustomChartContext) => {
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (error) {
        console.error('Error during render:', error);
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

(async () => {
    const ctx = await getChartContext({
        getDefaultChartConfig: (chartModel: ChartModel) => {
            const cols = chartModel.columns;
            const measureColumns = cols.filter((col) => col.type === ColumnType.MEASURE);

            return [
                {
                    key: 'column',
                    dimensions: [
                        { key: 'orig',    columns: measureColumns.slice(0, 1) },
                        { key: 'idx',     columns: measureColumns.slice(1, 2) },
                        { key: 'uplift',  columns: measureColumns.slice(2, 3) },
                        { key: 'disc',    columns: measureColumns.slice(3, 4) },
                        { key: 'sol',     columns: measureColumns.slice(4, 5) },
                        { key: 'renewed', columns: measureColumns.slice(5, 6) },
                        { key: 'cumIdx',  columns: measureColumns.slice(6, 7) },
                    ],
                },
            ];
        },

        getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Array<Query> => {
            return chartConfig.map((config) =>
                config.dimensions.reduce(
                    (acc: Query, dimension) => ({
                        queryColumns: [...acc.queryColumns, ...dimension.columns],
                    }),
                    { queryColumns: [] } as Query,
                ),
            );
        },

        renderChart,

        chartConfigEditorDefinition: [
            {
                key: 'column',
                label: 'Waterfall Chart Configuration',
                descriptionText: 'Map your ARR measures in order.',
                columnSections: [
                    { key: 'orig',    label: 'Original Renewal ARR',      allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                    { key: 'idx',     label: 'Indexation ARR',            allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                    { key: 'uplift',  label: 'Renewal Uplift ARR',        allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                    { key: 'disc',    label: 'Discounts ARR',             allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                    { key: 'sol',     label: 'Net Solutions ARR',         allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                    { key: 'renewed', label: 'Renewed ARR',               allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                    { key: 'cumIdx',  label: 'Cumulative Indexation ARR', allowAttributeColumns: false, allowMeasureColumns: true, maxColumnCount: 1 },
                ],
            },
        ],

        visualPropEditorDefinition: {
            elements: [
                { key: 'numberFormat',   type: 'text',     defaultValue: '0.[0]a',  label: 'Number Format' },
                { key: 'colorPositive',  type: 'text',     defaultValue: '#378ADD', label: 'Positive bar colour (HEX)' },
                { key: 'colorNegative',  type: 'text',     defaultValue: '#E24B4A', label: 'Negative bar colour (HEX)' },
                { key: 'colorTotal',     type: 'text',     defaultValue: '#534AB7', label: 'Total bar colour (HEX)' },
                { key: 'showDataLabels', type: 'checkbox', defaultValue: true,      label: 'Show data labels' },
            ],
        },
    });

    renderChart(ctx);
})();
