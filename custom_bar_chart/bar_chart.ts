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
    colorCumulative?: string;
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

function getDataModel(chartModel: ChartModel) {
    const dataArr: DataPointsArray =
        chartModel.data?.[chartModel.data.length - 1]?.data ?? { columns: [], dataValue: [] };

    let orig = 0, idx = 0, uplift = 0, disc = 0, sol = 0, renewed = 0, cumIdx = 0;

    dataArr.dataValue.forEach((row) => {
        orig    += parseFloat(String(row[1] ?? 0)) || 0;
        idx     += parseFloat(String(row[2] ?? 0)) || 0;
        uplift  += parseFloat(String(row[3] ?? 0)) || 0;
        disc    += parseFloat(String(row[4] ?? 0)) || 0;
        sol     += parseFloat(String(row[5] ?? 0)) || 0;
        renewed += parseFloat(String(row[6] ?? 0)) || 0;
        cumIdx  += parseFloat(String(row[7] ?? 0)) || 0;
    });

    const cols = chartModel.columns ?? [];
    const colName = (i: number) => cols[i]?.name ?? '';

    return {
        orig, idx, uplift, disc, sol, renewed, cumIdx,
        colNames: {
            orig:    colName(1) || 'Original Renewal ARR',
            idx:     colName(2) || 'Indexation ARR',
            uplift:  colName(3) || 'Renewal Uplift ARR',
            disc:    colName(4) || 'Discounts ARR',
            sol:     colName(5) || 'Net Solutions ARR',
            renewed: colName(6) || 'Renewed ARR',
            cumIdx:  colName(7) || 'Cumulative Indexation ARR',
        },
    };
}

function render(ctx: CustomChartContext) {
    const chartModel = ctx.getChartModel();
    const dm = getDataModel(chartModel);
    const visualProps = (chartModel.visualProps ?? {}) as VisualProps;

    const numberFormat    = visualProps.numberFormat    ?? '0.[0]a';
    const colorPositive   = visualProps.colorPositive   ?? '#378ADD';
    const colorNegative   = visualProps.colorNegative   ?? '#E24B4A';
    const colorTotal      = visualProps.colorTotal      ?? '#534AB7';
    const colorCumulative = visualProps.colorCumulative ?? '#D85A30';
    const showDataLabels  = visualProps.showDataLabels  ?? true;

    const { orig, idx, uplift, disc, sol, renewed, cumIdx, colNames } = dm;

    const waterfallData = [
        { name: colNames.orig,    y: orig,          color: colorTotal,    isSum: true  },
        { name: colNames.idx,     y: idx,            color: colorPositive               },
        { name: colNames.uplift,  y: uplift,         color: colorPositive               },
        { name: colNames.disc,    y: -Math.abs(disc),color: colorNegative               },
        { name: colNames.sol,     y: sol,            color: colorPositive               },
        { name: colNames.renewed, y: renewed,        color: colorTotal,    isSum: true  },
    ];

    const categories = waterfallData.map((d: any) => d.name);
    const cumulativeLine = categories.map(() => cumIdx);

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

        legend: {
            enabled: true,
            align: 'right',
            verticalAlign: 'top',
            layout: 'vertical',
        },

        tooltip: {
            backgroundColor: '#3A3F48',
            borderColor: '#FFD700',
            borderRadius: 4,
            borderWidth: 1,
            style: { color: '#FFFFFF', fontSize: '12px' },
            useHTML: true,
            formatter: function (this: any) {
                const val = this.y ?? 0;
                const cumulative = this.point?.cumulative ?? 0;
                return `
                    <b>${this.key}</b><br/>
                    <b>Value:</b> ${formatNumber(Math.abs(val), numberFormat)}<br/>
                    <b>Running total:</b> ${formatNumber(cumulative, numberFormat)}
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
                        color: '#333',
                        textOutline: '1px white',
                    },
                    formatter: function (this: any) {
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
                                        { columnId: chartModel.columns?.[1]?.id ?? '', value: point.name },
                                        { columnId: chartModel.columns?.[6]?.id ?? '', value: point.y },
                                    ],
                                },
                            });
                        },
                    },
                },
            },
            line: {
                dashStyle: 'Dash',
                marker: { enabled: false },
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
            {
                type: 'line',
                name: colNames.cumIdx,
                data: cumulativeLine,
                color: colorCumulative,
                dashStyle: 'Dash',
                marker: { enabled: false },
                zIndex: 5,
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
            const attributeColumns = cols.filter((col) => col.type === ColumnType.ATTRIBUTE);

            return [
                {
                    key: 'column',
                    dimensions: [
                        { key: 'date',    columns: attributeColumns.slice(0, 1) },
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
                    { key: 'date',    label: 'Date (optional)',           allowAttributeColumns: true,  allowMeasureColumns: false, maxColumnCount: 1 },
                    { key: 'orig',    label: 'Original Renewal ARR',      allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                    { key: 'idx',     label: 'Indexation ARR',            allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                    { key: 'uplift',  label: 'Renewal Uplift ARR',        allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                    { key: 'disc',    label: 'Discounts ARR',             allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                    { key: 'sol',     label: 'Net Solutions ARR',         allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                    { key: 'renewed', label: 'Renewed ARR',               allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                    { key: 'cumIdx',  label: 'Cumulative Indexation ARR', allowAttributeColumns: false, allowMeasureColumns: true,  maxColumnCount: 1 },
                ],
            },
        ],

        visualPropEditorDefinition: {
            elements: [
                { key: 'numberFormat',    type: 'text',     defaultValue: '0.[0]a',  label: 'Number Format' },
                { key: 'colorPositive',   type: 'text',     defaultValue: '#378ADD', label: 'Positive bar colour (HEX)' },
                { key: 'colorNegative',   type: 'text',     defaultValue: '#E24B4A', label: 'Negative bar colour (HEX)' },
                { key: 'colorTotal',      type: 'text',     defaultValue: '#534AB7', label: 'Total bar colour (HEX)' },
                { key: 'colorCumulative', type: 'text',     defaultValue: '#D85A30', label: 'Cumulative line colour (HEX)' },
                { key: 'showDataLabels',  type: 'checkbox', defaultValue: true,      label: 'Show data labels' },
            ],
        },
    });

    renderChart(ctx);
})();
