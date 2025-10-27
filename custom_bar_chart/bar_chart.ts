import {
    ChartToTSEvent,
    ColumnType,
    getChartContext,
    CustomChartContext,
    ChartModel,
    ChartConfig,
    DataPointsArray,
    Query,
    ChartColumn,
    AxisMenuActions,
    ColumnProp,
} from '@thoughtspot/ts-chart-sdk';
import Highcharts, { color, Tooltip } from 'highcharts';
import numeral from 'numeral';
import _ from 'lodash';
import HighchartsCustomEvents from 'highcharts-custom-events';

HighchartsCustomEvents(Highcharts);

declare module 'highcharts' {
    interface PointOptionsObject {
        tooltipdata?: Array<{ columnName: string, value: number }>;
    }
}

declare module 'highcharts' {
    interface Point {
        tooltipData?: Array<{ columnName: string; value: any }>;
    }
}

interface VisualProps {
    numberFormat?: string;
    stackColors?: Record<string, string>; // Stack colors
    showTotalStackLabels?: boolean;
    colorMapping?: Record<string, string>; // Map stack values to colors
}

let globalChartReference: Highcharts.Chart;

// Utility to format numbers dynamically with K, M, B
function formatNumber(value: number, format: string): string {
    try {
        const formattedValue = numeral(value).format(format);
        return formattedValue.replace('k', 'K').replace('m', 'M').replace('b', 'B');
    } catch (error) {
        console.error("Error formatting number:", error);
        return value.toString();
    }
}

const seriesColorMap: Record<string, string> = {};
function generateRandomColor(): string {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
}
function getBackgroundColorForSeries(seriesName: string): string {
    if (seriesColorMap[seriesName]) {
        return seriesColorMap[seriesName];
    }
    const color = generateRandomColor();
    seriesColorMap[seriesName] = color;
    return color;
}

function getDataModel(chartModel: ChartModel) {
    const configDimensions =
        chartModel.config?.chartConfig?.[1]?.dimensions ??
        chartModel.config?.chartConfig?.[0]?.dimensions ??
        [];

    const dataArr: DataPointsArray = chartModel.data?.[chartModel.data?.length - 1]?.data ?? { columns: [], dataValue: [] };

    // Defensive checks for all columns
    const xAxisColumn = configDimensions?.[0]?.columns?.[0];
    const seriesColumn = configDimensions?.[1]?.columns?.[0];
    const measureColumn = configDimensions?.[2]?.columns?.[0];
    const comparisonColumn = configDimensions?.[3]?.columns?.[0];
    const tooltipArr = configDimensions?.[4]?.columns || [];

    // Log for debugging
    console.log("Config Dimensions:", configDimensions);
    console.log("Tooltip Columns:", tooltipArr);

    const xAxisLabels = _.uniq(
        dataArr.dataValue.map((row) =>
            row[dataArr.columns.indexOf(xAxisColumn?.id)] ?? "N/A"
        )
    );

    const seriesData = _.groupBy(
        dataArr.dataValue,
        (row) => row[dataArr.columns.indexOf(seriesColumn?.id)]
    );

    const series = Object.keys(seriesData).map((seriesName) => {
        const data = xAxisLabels.map((label) => {
            const row = seriesData[seriesName]?.find(
                (item) =>
                    item[dataArr.columns.indexOf(xAxisColumn?.id)] === label
            );
            const measureValue = row
                ? parseFloat(row[dataArr.columns.indexOf(measureColumn?.id)])
                : 0;
            const comparisonValue = row
                ? parseFloat(
                      row[dataArr.columns.indexOf(comparisonColumn?.id)]
                  )
                : 0;

            // Tooltip Data Handling with Validation
            const tooltipData = tooltipArr.map((col) => {
                const columnIndex = dataArr.columns.findIndex((c) => c === col.id);
                return {
                    columnName: col.name,
                    value: row ? row[columnIndex] ?? "N/A" : "N/A", // Handle missing data
                };
            });

            return { measureValue, comparisonValue, tooltipData };
        });

        return {
            name: seriesName,
            data,
            color: getBackgroundColorForSeries(seriesName),
            stack: "stack1",
        };
    });

    return {
        xAxisLabels,
        series,
    };
}

function getComparisonColumnName(chartModel: ChartModel): string {
    const comparisonColumn = chartModel.config?.chartConfig?.[0]?.dimensions.find(
        (dim) => dim.key === 'comparison'
    )?.columns[0];
    return comparisonColumn?.name || 'Comparison';
}


function getAxisTitles(chartModel: ChartModel): { xAxisTitle: string, yAxisTitle: string, comparisonMeasureTitle: string } {
    const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];
    const xAxisColumn = configDimensions?.[0]?.columns?.[0];
    const yAxisColumn = configDimensions?.[2]?.columns?.[0];
    const comparisonColumn = configDimensions?.[3]?.columns?.[0];

    const xAxisTitle = xAxisColumn?.name || 'X-Axis';
    const yAxisTitle = yAxisColumn?.name || 'Y-Axis';
    const comparisonMeasureTitle = comparisonColumn?.name || 'Comparison Measure';

    return { xAxisTitle, yAxisTitle, comparisonMeasureTitle };
}

function render(ctx: CustomChartContext) {
    const chartModel = ctx.getChartModel();
    const dataModel = getDataModel(chartModel);
    const comparisonMeasureName = getComparisonColumnName(chartModel);
    const { xAxisTitle, yAxisTitle } = getAxisTitles(chartModel);
    const numberFormat = (chartModel.visualProps as VisualProps)?.numberFormat || '0.[0]a';
    const visualProps = chartModel.visualProps as VisualProps;    
    const showTotalStackLabels = visualProps?.showTotalStackLabels ?? true; // Default to true
    const stackColors = visualProps.stackColors || {};
    const stack_column_id = chartModel.config?.chartConfig?.[0]?.dimensions?.[1]?.columns?.[0]?.id;


        // Get user-defined stack colors
    const stackColorsInput = visualProps?.stackColors || '';
    const stackColorsArray = stackColorsInput.split(',').map(color => color.trim());
        
        // Assign colors to stack values
    const stackValues = [...new Set(dataModel.series.map(series => series.name))]; // Unique stack values
    const stackColorsMap = stackValues.reduce((map, stackValue, index) => {
    map[stackValue] = stackColorsArray[index] || '#CCCCCC'; // Default to gray if not enough colors
        return map;
    }, {} as Record<string, string>);

        // Sort series alphabetically by name
    const sortedSeries = dataModel.series.sort((a, b) => a.name.localeCompare(b.name));


    console.log('stack_column_id' + stack_column_id);

    if (globalChartReference) {
        globalChartReference.destroy();
    }


    globalChartReference = Highcharts.chart({
        chart: {
            renderTo: 'chart',
            type: 'bar',
            events: {
                load: function () {
                    console.log("Chart loaded successfully");

                    // Add right-click (context menu) event listener
                    this.container.addEventListener('contextmenu', function (event) {
                        event.preventDefault();

                        const pointerEvent = new PointerEvent('pointerdown', {
                            clientX: event.clientX,
                            clientY: event.clientY,
                            pointerType: 'mouse',
                        });

                        const clickedPoint = globalChartReference.series[0].searchPoint(pointerEvent, true);
                        if (clickedPoint) {
                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: {
                                    clientX: event.clientX,
                                    clientY: event.clientY,
                                },
                                clickedPoint: {
                                    tuple: [
                                        { columnId: chartModel.columns[1].id, value: clickedPoint.category },
                                        { columnId: chartModel.columns[0].id, value: clickedPoint.series.name },
                                        { columnId: chartModel.columns[2].id, value: clickedPoint.y },
                                    ],
                                },
                            });
                        }
                    });
                },
            },
        },
        
        title: { text: '' },
        xAxis: {
            categories: dataModel.xAxisLabels,
            lineWidth: 0,
            title: { 
                enabled: true,
                text: xAxisTitle, // add image here HTML
                style: {
                    fontWeight: 'bold',
                    color: '#000000',
                },
                events: {
                    click: function (e) {
                        const axisValue = this.value; // Value of the X-axis label
                        const columnIds = chartModel.config?.chartConfig?.[0]?.dimensions?.[0]?.columns.map(col => col.id) || [];
                        
                        ctx.emitEvent(ChartToTSEvent.OpenAxisMenu, {
                            columnIds: columnIds,
                            event: {
                                clientX: e.clientX,
                                clientY: e.clientY,
                            },
                            selectedActions: AxisMenuActions[axisValue],
                        });
                    },
                },
            } as any,
            gridLineWidth: 0,
        },

        yAxis: {
            min: 0,
            title: {
                useHTML: true, 
                text: yAxisTitle, //add HTML image here,
                gridLineWidth: 0,
                LineWidth: 0,
                style: {
                    fontWeight: 'bold',
                    color: '#000000',
                },
                events: {
                    click: function (e) {
                        const axisValue = this.value;
                        const columnIds = chartModel.config?.chartConfig?.[0]?.dimensions?.[2]?.columns.map(col => col.id) || [];
                        
                        ctx.emitEvent(ChartToTSEvent.OpenAxisMenu, {
                            columnIds: columnIds,
                            event: {
                                clientX: e.clientX,
                                clientY: e.clientY,
                            },
                            selectedActions: AxisMenuActions[axisValue],
                        });
                    },
                },
            } as any,
            gridLineWidth: 0,
            labels: {
                formatter: function () {
                    return formatNumber(this.value as number, numberFormat);
                },
            },
            stackLabels: {
                enabled: showTotalStackLabels,
                formatter: function () {
                    return formatNumber(this.total as number, numberFormat);
                },
                style: { color: '#000' },
            },
        },
        legend: {
            align: 'right',
            verticalAlign: 'top',
            layout: 'vertical',
        },
        credits: {
            enabled: false,
        },
        tooltip: {
            followPointer: true,
            padding: 10,
            shadow: true,
            backgroundColor: '#3A3F48',
            borderColor: '#FFD700',
            borderRadius: 4,
            borderWidth: 1,
            headerFormat: '',
            style: {
                color: '#FFFFFF',
                fontSize: '12px',
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: 'normal',
                textAlign: 'left',
            },
            useHTML: true,
            pointFormatter: function () {
                const point = this;
                const options = point.options;
                debugger;
                const tooltipData = point.tooltipData;

                const pointValue = this.y as number;
                const stackTotal = this.total as number;
                const comparisonValue = this.point?.comparisonValue || 0;
                const changePercent = 
                    ((pointValue - options.comparisonValue) / options.comparisonValue) * 100;
                const percentageOfTotal = stackTotal
                    ? ((pointValue / stackTotal) * 100).toFixed(1)
                    : 0;
        
                const xAxisName = this.series?.chart?.userOptions?.xAxis?.[0]?.title?.text || 'X-Axis';
                const stackColumnName =
                    chartModel.config?.chartConfig?.[0]?.dimensions?.[1]?.columns?.[0]?.name || 'Stack';
                const yAxisName =
                    this.series?.chart?.userOptions?.yAxis?.[0]?.title?.text || 'Y-Axis';
                const comparisonName =
                    chartModel.config?.chartConfig?.[0]?.dimensions?.[3]?.columns?.[0]?.name || 'Comparison';

                
                debugger;
                
                let tooltipHtml = `
                    <br><b>${xAxisName}:</b> ${point.category || 'N/A'}<br><br>
                    <b>${stackColumnName}:</b> ${this.series.name || 'N/A'}<br><br>
                    <b>${yAxisName}:</b> ${formatNumber(point.y || 0, numberFormat)}<br><br>
                    <b>${comparisonName}:</b> ${formatNumber(options.comparisonValue || 0, numberFormat)}<br><br>
                    <b>${changePercent.toFixed(2)}% vs. ${comparisonMeasureName}<br><br>
                    ${percentageOfTotal}% of Total<br><br>
                `;

                console.log(tooltipData + ' within Tooltip');

                if (tooltipData && Array.isArray(tooltipData)) {
                    tooltipData.forEach((data) => {
                        tooltipHtml += `<b>${data.columnName}:</b> ${formatNumber(data.value || 'N/A',numberFormat)}<br><br>`;
                    });
                } else {
                    tooltipHtml+= null;
                }

                return tooltipHtml;
            },
        },
        plotOptions: {
            series: {
                stacking: 'normal',
                pointPadding: 0.1,
                groupPadding: 0.05,
                pointWidth: 30,
                dataLabels: {
                    enabled: true,
                    align: 'centre',
                    overflow: 'none',
                    verticalAlign: 'middle',
                    inside: true,
                    crop: 'true',
                    formatter: function () {
                        const point = this.point;
                        const pointValue = this.y as number;
                        const stackTotal = this.total as number;
                        const comparisonValue = this.point?.comparisonValue || 0;
                        const changePercent = comparisonValue
                          ? ((pointValue - comparisonValue) / comparisonValue) * 100
                          : 0;
                        const percentageOfTotal = stackTotal
                          ? ((pointValue / stackTotal) * 100).toFixed(1)
                          : 0;
            
                        const fullLabel = `${formatNumber(
                          pointValue,
                          numberFormat
                        )} | ${changePercent.toFixed(
                          2
                        )}% vs. ${comparisonMeasureName} | ${percentageOfTotal}% of Ttl.`;

                        if(this.point.shapeArgs.height > fullLabel.length * 6){
                            //check .height value
                            return fullLabel;
                        } else {
                            const availableLength = Math.floor(this.point.shapeArgs.height/6) - 6;
                            if(availableLength < 3) return;
                            return fullLabel.slice(0, availableLength) + ' ...';
                        }
                      },
                    style: {
                        fontFamily: 'optimo-plain, "Helvetica Neue", Helvetica, Arial, sans-serif',
                        fontWeight: '500',
                        color: '#5e5e5e',
                        fontSize: '12.5px',
                        textOutline: '1.6px white',
                        textShadow: 'rgba(255, 255, 255, 0.6) 0px 0px 2px',
                    },
                },
                point: {
                    events: {
                        contextmenu: function (e) {
                            e.preventDefault();
                            const point = this;
                            console.log('1 value: ' + chartModel.columns[0].id + ', Value: ' + point.series.name);
                            console.log('2 value: ' + chartModel.columns[1].id + ', Value: ' + point.category);
                            console.log('3 value: ' + chartModel.columns[2].id + ', Value: ' + point.y);

                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: {
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                },
                                clickedPoint: {
                                    tuple: [
                                        { columnId: chartModel.columns[1].id, value: point.category },
                                        { columnId: chartModel.columns[0].id, value: point.series.name },
                                        { columnId: chartModel.columns[2].id, value: point.y },
                                    ],
                                },
                            });
                        },
                    },
                },
            },
        } as any,
        series: sortedSeries.map(s => ({
            ...s,
            data: s.data.map(d => ({
                y: d.measureValue || 0,
                
                comparisonValue: d.comparisonValue,
                tooltipData: d.tooltipData,
            })),
            color: stackColorsMap[s.name], // Apply user-defined color // Assign color based on user input or fallback to default
        })) as Highcharts.SeriesOptionsType[],
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
            const stack_column_id = chartModel.config?.chartConfig?.[0]?.dimensions?.[1]?.columns?.[0]?.id; // Fetch stack column ID

            const attributeColumns = cols.filter((col) => col.type === ColumnType.ATTRIBUTE);
            const measureColumns = cols.filter((col) => col.type === ColumnType.MEASURE);

            if (attributeColumns.length < 2) {
                throw new Error('Insufficient attribute columns for x and stack axes.');
            }
            if (measureColumns.length < 2) {
                throw new Error('Insufficient measure columns for y and comparison axes.');
            }

            return [
                {
                    key: 'column',
                    dimensions: [
                        { key: 'x', columns: [attributeColumns[0]] },
                        { key: 'stack', columns: [attributeColumns[1]] },
                        { key: 'y', columns: measureColumns.slice(0, 1) },
                        { key: 'comparison', columns: measureColumns.slice(1, 2) },
                        { key: 'Tooltip', columns: measureColumns.slice(2)}

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
                    { queryColumns: [] } as Query
                )
            );
        },
        renderChart,
        chartConfigEditorDefinition: [
            {
                key: 'column',
                label: 'Bar Chart Configuration',
                descriptionText:
                    'Configure the chart by selecting attributes for X-axis, stack, measure, and comparison.',
                columnSections: [
                    {
                        key: 'x',
                        label: 'X-Axis Attribute',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'stack',
                        label: 'Stack Attribute',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'y',
                        label: 'Y-Axis Measure',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'comparison',
                        label: 'Comparison Measure',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'Tooltip',
                        label: 'Tooltip Columns',
                        allowAttributeColumns: true,
                        allowMeasureColumns: true,
                        allowTimeSeriesColumns: false
                    },
                ],
            },
        ],
        visualPropEditorDefinition: {
            elements: [
                {
                    key: 'showTotalStackLabels',
                    type: 'checkbox',
                    defaultValue: true, // Total stack labels visible by default
                    label: 'Show Total Stack Labels',
                },
                {
                    key: 'numberFormat',
                    type: 'text',
                    defaultValue: '0.[0]a',
                    label: 'Number Format',
                },
                {
                    key: 'stackColors', // New text box for stack colors
                    type: 'text',
                    label: 'Stack Colors (Comma-separated HEX)',
                },
            ],
        },
    });

    renderChart(ctx);
})();