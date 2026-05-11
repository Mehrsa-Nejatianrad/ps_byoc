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

    // Running totals for movement bars
    // Movements float between orig and renewed on a zoomed y-axis
    const p1 = orig;                    // start
    const p2 = p1 + cumIdx;            // after cumulative indexation
    const p3 = p2 + idx;               // after indexation
    const p4 = p3 + uplift;            // after renewal uplift
    const p5 = p4 + sol;               // after net solutions
    const p6 = p5 - Math.abs(disc);    // after discounts (goes down)
    // p6 should ≈ renewed

    // Movement bars only — 5 bars between orig and renewed
    // Each is a floating columnrange [low, high]
    const movements = [
        { name: colNames.cumIdx, low: p1, high: p2, delta: cumIdx,          color: colorPositive },
        { name: colNames.idx,    low: p2, high: p3, delta: idx,             color: colorPositive },
        { name: colNames.uplift, low: p3, high: p4, delta: uplift,          color: colorPositive },
        { name: colNames.sol,    low: p4, high: p5, delta: sol,             color: colorPositive },
        { name: colNames.disc,   low: p6, high: p5, delta: -Math.abs(disc), color: colorNegative },
    ];

    // Y-axis zoom: show only the range of movements with padding
    const allValues = [p1, p2, p3, p4, p5, p6, renewed];
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const padding = (yMax - yMin) * 0.15;
    const axisMin = yMin - padding;
    const axisMax = yMax + padding;

    // X categories: START label + 5 movements + END label
    const categories = [
        'START\n' + formatNumber(orig, numberFormat),
        ...movements.map(m => m.name),
        'END\n' + formatNumber(renewed, numberFormat),
    ];

    // columnrange data — START and END are zero-height invisible markers
    // movements are the real floating bars
    const seriesData = [
        // START — invisible, just holds the axis position
        { low: orig,    high: orig,    color: 'transparent', delta: orig,    isTotal: true, totalVal: orig    },
        ...movements.map(m => ({ ...m, isTotal: false, totalVal: null })),
        // END — invisible, just holds the axis position
        { low: renewed, high: renewed, color: 'transparent', delta: renewed, isTotal: true, totalVal: renewed },
    ];

    // Connector line: one continuous line connecting tops/bottoms of each bar
    const connectorY = [
        orig,  // top of START
        ...movements.map(m => m.delta >= 0 ? m.high : m.low), // top of positive, bottom of negative
        renewed, // top of END
    ];

    if (globalChartReference) {
        globalChartReference.destroy();
        globalChartReference = null;
    }

    globalChartReference = Highcharts.chart('chart', {
        chart: {
            type: 'columnrange',
            marginLeft: 80,
            marginRight: 40,
        },
        title: { text: '' },
        credits: { enabled: false },

        xAxis: {
            categories,
            lineWidth: 1,
            lineColor: '#ddd',
            gridLineWidth: 0,
            labels: {
                useHTML: true,
                formatter: function (this: any) {
                    const cat = this.value as string;
                    const isStartEnd = cat.startsWith('START') || cat.startsWith('END');
                    const parts = cat.split('\n');
                    if (isStartEnd) {
                        return `
                            <div style="text-align:center">
                                <div style="font-size:10px;color:#888;text-transform:uppercase;font-weight:600">${parts[0]}</div>
                                <div style="font-size:13px;font-weight:700;color:${colorTotal}">${parts[1] ?? ''}</div>
                            </div>`;
                    }
                    return `<div style="text-align:center;font-size:11px;font-weight:600;color:#333;max-width:100px">${cat}</div>`;
                },
                style: { fontSize: '11px' },
            },
            title: { text: '' },
        },

        yAxis: {
            min: axisMin,
            max: axisMax,
            title: {
                text: 'ARR (EUR)',
                style: { fontWeight: 'bold', color: '#000' },
            },
            gridLineWidth: 1,
            gridLineColor: '#f0f0f0',
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
                const point = this.point as any;
                if (point.isTotal) return false; // hide tooltip for start/end markers
                const delta = point.delta ?? 0;
                const sign = delta >= 0 ? '+' : '';
                const runningTotal = delta >= 0 ? point.high : point.low;
                return `
                    <b>${categories[point.x]}</b><br/>
                    <b>Change:</b> ${sign}${formatNumber(delta, numberFormat)}<br/>
                    <b>Running total:</b> ${formatNumber(runningTotal, numberFormat)}
                `;
            },
        },

        plotOptions: {
            columnrange: {
                borderWidth: 0,
                pointPadding: 0.05,
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
                        const point = this.point as any;
                        if (point.isTotal) return '';
                        const delta = point.delta ?? 0;
                        const sign = delta >= 0 ? '+' : '-';
                        return sign + formatNumber(Math.abs(delta), numberFormat);
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
            line: {
                marker: { enabled: false },
                enableMouseTracking: false,
                states: { hover: { enabled: false } },
            },
        },

        series: [
            {
                type: 'columnrange',
                name: 'Movements',
                data: seriesData.map(d => ({
                    low: d.low,
                    high: d.high,
                    color: d.color,
                    delta: d.delta,
                    isTotal: d.isTotal,
                })),
                showInLegend: false,
            },
            // Dotted connector line running through the tops of each bar
            {
                type: 'line',
                name: 'connector',
                data: connectorY.map((y, i) => ({ x: i, y })),
                color: '#bbb',
                dashStyle: 'Dot',
                lineWidth: 1,
                marker: { enabled: false },
                showInLegend: false,
                enableMouseTracking: false,
            },
            // START total label marker (circle at orig level)
            {
                type: 'scatter',
                name: 'start-marker',
                data: [{ x: 0, y: orig }],
                marker: {
                    symbol: 'circle',
                    radius: 6,
                    fillColor: colorTotal,
                    lineWidth: 0,
                },
                showInLegend: false,
                enableMouseTracking: false,
            },
            // END total label marker (circle at renewed level)
            {
                type: 'scatter',
                name: 'end-marker',
                data: [{ x: categories.length - 1, y: renewed }],
                marker: {
                    symbol: 'circle',
                    radius: 6,
                    fillColor: colorTotal,
                    lineWidth: 0,
                },
                showInLegend: false,
                enableMouseTracking: false,
            },
        ],
    });

    // Draw START and END value callout boxes using Highcharts SVG renderer
    const chart = globalChartReference;
    const xAxis = chart.xAxis[0];
    const yAxis = chart.yAxis[0];

    const drawCallout = (xCat: number, yVal: number, label: string, color: string) => {
        const px = xAxis.toPixels(xCat, false);
        const py = yAxis.toPixels(yVal, false);
        const w = 80, h = 28, r = 14;

        chart.renderer.rect(px - w / 2, py - h / 2, w, h, r)
            .attr({ fill: color, zIndex: 5 })
            .add();

        chart.renderer.text(label, px, py + 5)
            .attr({ align: 'center', zIndex: 6 })
            .css({ color: '#fff', fontSize: '12px', fontWeight: '700' })
            .add();
    };

    drawCallout(0, orig,    formatNumber(orig,    numberFormat), colorTotal);
    drawCallout(categories.length - 1, renewed, formatNumber(renewed, numberFormat), colorTotal);
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
