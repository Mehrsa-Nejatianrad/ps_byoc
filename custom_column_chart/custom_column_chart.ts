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
    getCustomCalendarGuidFromColumn,
    AxisMenuActions,
    ColumnProp,
    AppConfig,
} from '@thoughtspot/ts-chart-sdk';
import Highcharts, { color, Tooltip } from 'highcharts';
import {
    generateMapOptions,
    getDataFormatter,
} from '@thoughtspot/ts-chart-sdk/src/utils/formatting-util';
import numeral from 'numeral';
import * as _ from 'lodash';
import HighchartsCustomEvents from 'highcharts-custom-events';

HighchartsCustomEvents(Highcharts);


interface VisualProps {
    numberFormat?: string;
    DatalabelsToggle?: boolean;
}

// Utility function to format numbers
function formatNumber(value: number, format: string): string {
    try {
        return numeral(value).format(format).replace('k', 'K').replace('m', 'M').replace('b', 'B');
    } catch (error) {
        console.error("Error formatting number:", error);
        return value.toString();
    }
}

function getDataForColumn(column: ChartColumn, dataArr: DataPointsArray) {
    const formatter = getDataFormatter(column, { isMillisIncluded: false });
    const idx = _.findIndex(dataArr.columns, (colId) => column.id === colId);
    const dataForCol = _.map(dataArr.dataValue, (row) => {
        const colValue = row[idx];
        return colValue;
    });
    const options = generateMapOptions(appConfigGlobal, column, dataForCol);
    const formattedValuesForData = _.map(dataArr.dataValue, (row) => {
        const colValue = row[idx];
        if (getCustomCalendarGuidFromColumn(column))
            return formatter(colValue.v.s, options);
        return formatter(colValue, options);
    });

    return formattedValuesForData;
}


// Extract data from ThoughtSpot ChartModel
function getDataModel(chartModel: ChartModel, selectedMeasureId: string) {
    const dataArr = chartModel.data?.[chartModel.data?.length - 1]?.data ?? { columns: [], dataValue: [] };

    const measureColumn = chartModel.columns.find(col => col.id === selectedMeasureId);
    if (!measureColumn) {
        console.error('Selected measure not found.');
        return { xAxisLabels: [], seriesData: [] };
    }

    const xAxisColumn = chartModel.config?.chartConfig?.[0]?.dimensions?.[0]?.columns?.[0];
    const sliceByColumn = chartModel.config?.chartConfig?.[0]?.dimensions?.[2]?.columns?.[0];

    if (!xAxisColumn) {
        console.error('X-axis column is undefined.');
        return { xAxisLabels: [], seriesData: [] };
    }

    // ✅ Properly formatted X Axis labels
    const xAxisLabels = _.uniq(getDataForColumn(xAxisColumn, dataArr));

    // ✅ Properly formatted Slice By values
    const sliceByValues = sliceByColumn
        ? _.uniq(getDataForColumn(sliceByColumn, dataArr))
        : ['Default'];

    // ✅ Full formatted values for matching
    const xAxisFormattedValues = getDataForColumn(xAxisColumn, dataArr);
    const sliceByFormattedValues = sliceByColumn
        ? getDataForColumn(sliceByColumn, dataArr)
        : [];

    // ✅ Create series data safely
    const seriesData = sliceByValues.map(slice => ({
        name: slice,
        data: xAxisLabels.map(label => {
            const index = xAxisFormattedValues.findIndex((formattedLabel, idx) =>
                formattedLabel === label &&
                (sliceByColumn ? sliceByFormattedValues[idx] === slice : true)
            );
            if (index === -1) return 0;
            const row = dataArr.dataValue[index];
            return row
                ? parseFloat(row[dataArr.columns.indexOf(measureColumn.id)]) || 0
                : 0;
        }),
    }));

    return { xAxisLabels, seriesData };
}


// Function to get measure columns 
function getMeasureColumns(chartModel: ChartModel) {
    return chartModel.columns.filter(col => col.type === ColumnType.MEASURE);
}


// Function to create measure selection buttons and update styles dynamically
function createMeasureButtons(
    chartModel: ChartModel,
    updateChart: (selectedMeasure: string) => void,
    selectedMeasure?: string // ✅ Allow passing selected measure
) {
    const measureContainer = document.getElementById('buttonContainer'); // ✅ Correct container ID

    if (!measureContainer) {
        console.error("❌ Error: 'buttonContainer' container not found.");
        return;
    }

    measureContainer.innerHTML = ''; // Clear previous buttons

    const measureColumns = getMeasureColumns(chartModel);
    const defaultMeasure = selectedMeasure || measureColumns[0]?.id; // ✅ Default to first measure if none is selected

    measureColumns.forEach((measure) => {
        const button = document.createElement('button');
        button.innerText = measure.name;
        button.classList.add('measure-button');

        // ✅ Apply 'active-measure' class to the initially selected measure button
        if (measure.id === defaultMeasure) {
            button.classList.add('active-measure');
        }

        button.onclick = () => {
            // ✅ Remove 'active-measure' from all buttons BEFORE updating the chart
            document.querySelectorAll('.measure-button').forEach(btn => btn.classList.remove('active-measure'));

            // ✅ Add 'active-measure' to clicked button
            button.classList.add('active-measure');

            // ✅ Now update the chart (UI updates first for instant feedback)
            updateChart(measure.id);
        };

        measureContainer.appendChild(button);
    });
}

let appConfigGlobal: AppConfig; // Move outside


// Function to render the chart with dynamic measure selection
function render(ctx: CustomChartContext, selectedMeasure?: string) {
    const chartModel = ctx.getChartModel();
    appConfigGlobal = ctx.getAppConfig();
    const measureColumns = getMeasureColumns(chartModel);
    const visualProps = chartModel.visualProps as VisualProps;    
    const datalablestoggle = visualProps?.DatalabelsToggle ?? true; // Default to true


    if (measureColumns.length === 0) {
        console.warn('No measure columns available.');
        return;
    }

    const firstMeasure = selectedMeasure || measureColumns[0]?.id;
    const selectedMeasureColumn = measureColumns.find(m => m.id === firstMeasure);
    const selectedMeasureName = selectedMeasureColumn ? selectedMeasureColumn.name : 'Measure';

    const xAxisColumn = chartModel.config?.chartConfig?.[0]?.dimensions?.[0]?.columns?.[0];
    const xAxisTitle = xAxisColumn ? xAxisColumn.name : 'Categories';

    const sliceByColumn = chartModel.config?.chartConfig?.[0]?.dimensions?.[2]?.columns?.[0]; // Slice by Colour column
    const sliceByColumnName = sliceByColumn ? sliceByColumn.name : "Category Group";

    console.log('Selected Measure ID:', firstMeasure);
    console.log('Selected Measure Name:', selectedMeasureName);
    console.log('Slice by Column:', sliceByColumnName);

    createMeasureButtons(chartModel, (newMeasure) => render(ctx, newMeasure), firstMeasure);

    const dataModel = getDataModel(chartModel, firstMeasure);
    const numberFormat = (chartModel.visualProps as any)?.numberFormat || '0.[0]a';

    Highcharts.chart({
        chart: {
            renderTo: 'chart',
            type: 'column',
            height: window.innerHeight * 0.9,
            events: {
                load: function () {
                    console.log("Chart loaded successfully");
        
                    const chartInstance = this; // ✅ Store Highcharts instance
        
                    // Add right-click (context menu) event listener
                    chartInstance.container.addEventListener('contextmenu', function (event) {
                        event.preventDefault();
                    
                        const pointerEvent = chartInstance.pointer.normalize(event);
                        let clickedPoint: any = null; // <-- Full any type safely
                    
                        chartInstance.series.forEach((series) => {
                            series.points.forEach((point) => {
                                if (point.graphic && point.graphic.element === event.target) {
                                    clickedPoint = point;
                                }
                            });
                        });
                    
                        if (clickedPoint) {
                            console.log(
                                "Right-clicked on:",
                                clickedPoint?.category || clickedPoint?.name,
                                clickedPoint?.y
                            );
                    
                            // Find correct xAxis and yAxis columns
                            const xAxisColumn = chartModel.config?.chartConfig?.[0]?.dimensions?.[0]?.columns?.[0];
                            const measureColumns = chartModel.config?.chartConfig?.[0]?.dimensions?.[1]?.columns || [];
                    
                            // Since you select one measure at a time (dynamic button), always pick first measure
                            const measureColumn = measureColumns[0];
                    
                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: {
                                    clientX: event.clientX,
                                    clientY: event.clientY,
                                },
                                clickedPoint: {
                                    tuple: [
                                        {
                                            columnId: xAxisColumn?.id ?? '',
                                            value: clickedPoint?.category || clickedPoint?.name,
                                        },
                                        {
                                            columnId: measureColumn?.id ?? '',
                                            value: clickedPoint?.y,
                                        },
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
            title: { 
                text: xAxisTitle,
                style: { 
                    fontWeight: 'bold' 
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
            minorGridLineWidth: 0,
            lineWidth: 0,
        },
        yAxis: {
            min: 0,
            gridLineWidth: 0,
            title: { 
                text: selectedMeasureName,  // ✅ Ensure correct measure name is shown
                style: { fontWeight: 'bold' },
                events: {
                    click: function (e) {
                        const axisValue = this.value;
                        const columnIds = chartModel.config?.chartConfig?.[0]?.dimensions?.[1]?.columns.map(col => col.id) || [];
                        
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
            labels: {
                formatter: function () {
                    return formatNumber(this.value as number, numberFormat); // ✅ Ensure y-axis labels use correct format
                },
            },
        },
        legend: { 
            enabled: true,
            align: 'center',
            layout: 'horizontal', // ✅ Stack legends vertically
            verticalAlign: 'top',
            itemMarginBottom: 5, // ✅ Add spacing between legend items
            floating: true, // ✅ Prevent legends from overlapping the chart
            x: 0, // ✅ Position closer to the chart edge
            title: {
                text: sliceByColumnName, // ✅ Shows legend title dynamically
            },
         },
        credits: { enabled: false },
        tooltip: {
            followPointer: true,
            padding: 10,
            shadow: true,
            backgroundColor: '#3A3F48',
            borderColor: '#808080',
            borderRadius: 4,
            borderWidth: 1,
            style: {
                color: '#FFFFFF',
                fontSize: '12px',
                fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
                fontWeight: 'normal',
                textAlign: 'left',
            },
            useHTML: true,
            formatter: function () {
                const point = this;
                const series = this.series;
                const chart = series.chart;
        
                // ✅ Safely extract X-axis and Y-axis names
                const xAxis = Array.isArray(chart.options.xAxis) ? chart.options.xAxis[0] : chart.options.xAxis;
                const yAxis = Array.isArray(chart.options.yAxis) ? chart.options.yAxis[0] : chart.options.yAxis;
        
                const xAxisName = xAxis?.title?.text || "X-Axis";
                const yAxisName = yAxis?.title?.text || "Measure";
        
                // ✅ Use `point.key` instead of `point.category` (Fix category error)
                const xValue = point.key || 'N/A';
        
                return `
                    ${xAxisName}:</b><br> ${xValue}<br><br>
                    <b>${yAxisName}:</b><br> ${formatNumber(point.y || 0, numberFormat)} <!-- ✅ Use correct number format -->

                `;
            },
        },
        plotOptions: {
            column: {
                grouping: true,
                pointPadding: 0.1,
                groupPadding: 0.275,
                pointWidth: 20,
                dataLabels: { 
                    enabled: datalablestoggle,
                    formatter: function () {
                        return formatNumber(this.y, numberFormat); // ✅ Ensure bar totals are formatted
                    },
                },
                borderWidth: 0, // ✅ Remove unnecessary borders
            },
        },
        series: dataModel.seriesData.map(series => ({
            ...series, // Spread existing series properties
            type: 'column' // Ensure each series has a type property
        })) as Highcharts.SeriesOptionsType[],        
    });
}


// Chart Rendering Handler
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

// ThoughtSpot Context Initialization
(async () => {
    const ctx = await getChartContext({
        getDefaultChartConfig: (chartModel: ChartModel) => {
            const cols = chartModel.columns;
            const attributeColumns = cols.filter(col => col.type === ColumnType.ATTRIBUTE);
            const measureColumns = cols.filter(col => col.type === ColumnType.MEASURE).slice(0, 5); // Limit to 5 measures
            const sliceByColumns = attributeColumns.slice(1, 2); // Take an additional attribute as slice
        
            if (attributeColumns.length < 1 || measureColumns.length < 1) {
                throw new Error('Insufficient attributes or measures for the chart.');
            }
        
            return [
                {
                    key: 'column',
                    dimensions: [
                        { key: 'x', columns: [attributeColumns[0]] }, // X-Axis
                        { key: 'y', columns: measureColumns }, // Measures (Up to 5)
                        { key: 'sliceBy', columns: sliceByColumns }, // Slice by Colour
                    ],
                },
            ];
        },
        getQueriesFromChartConfig: (chartConfig: ChartConfig[]) => {
            return chartConfig.map(config =>
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
                label: 'Column Chart Configuration',
                descriptionText: 'Configure the X-axis and Measure for your chart.',
                columnSections: [
                    {
                        key: 'x',
                        label: 'X-Axis (Category)',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        allowTimeSeriesColumns: true,
                        maxColumnCount: 1,
                    },
                    {
                        key: 'y',
                        label: 'Measure (Y-Axis)',
                        allowAttributeColumns: false,
                        allowMeasureColumns: true,
                        maxColumnCount: 5,
                    },
                    {
                        key: 'color-axis',
                        label: 'Slice By Color',
                        allowAttributeColumns: true,
                        allowMeasureColumns: false,
                        allowTimeSeriesColumns: false,
                        maxColumnCount: 1,
                    }
                ],
            },
        ],
        visualPropEditorDefinition: {
            elements: [
                {
                    key: 'numberFormat',
                    type: 'text',
                    defaultValue: '0.[0]a',
                    label: 'Number Format',
                },
                {
                    key: 'DatalabelsToggle',
                    type: 'checkbox',
                    defaultValue: true,
                    label: 'Column Total Labels',
                },
            ],
        },
    });

    renderChart(ctx);
})();

