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

// Highcharts + highcharts-more loaded via CDN script tags in index.html
// highcharts-more is required for columnrange
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

    const numberFormat   = visualProps.numberFormat   ?? '0.[0]a';
    const colorPositive  = visualProps.colorPositive  ?? '#378ADD';
    const colorNegative  = visualProps.colorNegative  ?? '#E24B4A';
    const colorTotal     = visualProps.colorTotal     ?? '#534AB7';
    const showDataLabels = visualProps.showDataLabels ?? true;

    const { orig, idx, uplift, disc, sol, renewed, cumIdx, colNames } = dm;

    // Compute running totals — each bar floats between its start and end
    // Order: Original → CumIdx → Indexation → Renewal Uplift → Net Solutions → Discounts → Renewed
    const p0 = 0;           // baseline
    const p1 = orig;        // after Original Renewal
    const p2 = p1 + cumIdx; // after Cumulative Indexation
    const p3 = p2 + idx;    // after Indexation
    const p4 = p3 + uplift; // after Renewal Uplift
    const p5 = p4 + sol;    // after Net Solutions
    const p6 = p5 - Math.abs(disc); // after Discounts (goes down)
    // Renewed ARR is the final total — drawn from 0 to renewed

    // Each point: [low, high, label, color, deltaLabel]
    // For total bars (orig, renewed): low=0, high=value
    // For movement bars: low=runningStart, high=runningEnd
    const bars = [
        { name: colNames.orig,    low: p0, high: p1, color: colorTotal,    delta: orig            },
        { name: colNames.cumIdx,  low: p1, high: p2, color: colorPositive, delta: cumIdx          },
        { name: colNames.idx,     low: p2, high: p3, color: colorPositive, delta: idx             },
        { name: colNames.uplift,  low: p3, high: p4, color: colorPositive, delta: uplift          },
        { name: colNames.sol,     low: p4, high: p5, color: colorPositive, delta: sol             },
        { name: colNames.disc,    low: p6, high: p5, color: colorNegative, delta: -Math.abs(disc) },
        { name: colNames.renewed, low: p0, high: renewed, color: colorTotal, delta: renewed       },
    ];

    const categories = bars.map(b => b.name);

    // Build connector lines between bars (dotted horizontal lines)
    // Each connector goes from the top of bar[i] to the position of bar[i+1]
    const connectorData: any[] = [];
    for (let i = 0; i < bars.length - 2; i++) {
        const fromBar = bars[i];
        const toBar = bars[i + 1];
        // The connector starts at the end of fromBar (high for positive, low for negative)
        const connectY = fromBar.high < fromBar.low ? fromBar.low : fromBar.high;
        connectorData.push({
            x: i + 0.4,
            x2: i + 1 - 0.4,
            y: connectY,
        });
    }

    if (globalChartReference) {
        globalChartReference.destroy();
        globalChartReference = null;
    }

    globalChartReference = Highcharts.chart('chart', {
        chart: { type: 'columnrange', inverted: false },
        title: { text: '' },
        credits: { enabled: false },

        xAxis: {
            categories,
            lineWidth: 0,
            gridLineWidth: 0,
            labels: {
                style: { fontWeight: 'bold', color: '#333', fontSize: '12px' },
            },
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
                const delta = point.delta ?? 0;
                const sign = delta >= 0 ? '+' : '';
                const isTotal = point.isTotal;
                return `
                    <b>${categories[point.x]}</b><br/>
                    ${isTotal
                        ? `<b>Total:</b> ${formatNumber(Math.abs(delta), numberFormat)}`
                        : `<b>Change:</b> ${sign}${formatNumber(delta, numberFormat)}`
                    }<br/>
                    <b>Running total:</b> ${formatNumber(point.high, numberFormat)}
                `;
            },
        },

        plotOptions: {
            columnrange: {
                borderWidth: 0,
                pointPadding: 0.1,
                groupPadding: 0.1,
                dataLabels: {
                    enabled: showDataLabels,
                    inside: true,
                    verticalAlign: 'middle',
                    style: {
                        fontWeight: '600',
                        fontSize: '11px',
                        color: '#fff',
                        textOutline: 'none',
                    },
                    formatter: function (this: any) {
                        const point = this.point;
                        return formatNumber(Math.abs(point.delta ?? 0), numberFormat);
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
                                        { columnId: chartModel.columns?.[0]?.id ?? '', value: categories[point.x] },
                                        { columnId: chartModel.columns?.[5]?.id ?? '', value: point.high },
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
                type: 'columnrange',
                name: 'ARR Waterfall',
                data: bars.map((b, i) => ({
                    low: b.low,
                    high: b.high,
                    color: b.color,
                    delta: b.delta,
                    isTotal: i === 0 || i === bars.length - 1,
                })),
                showInLegend: false,
            },
            // Dotted connector lines between bars
            {
                type: 'line',
                name: 'connectors',
                data: bars.slice(0, -1).map((b, i) => ({
                    x: i,
                    // Connect from the top of positive bars, bottom of negative bars
                    y: b.delta >= 0 ? b.high : b.low,
                })),
                color: '#aaa',
                dashStyle: 'Dot',
                lineWidth: 1,
                marker: { enabled: false },
                showInLegend: false,
                enableMouseTracking: false,
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
