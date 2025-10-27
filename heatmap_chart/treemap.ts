import Highcharts from 'highcharts';
import Exporting from 'highcharts/modules/exporting'; // Import the exporting module
import OfflineExporting from 'highcharts/modules/offline-exporting'; // Import the offline-exporting module
import Treemap from 'highcharts/modules/treemap';
import Heatmap from 'highcharts/modules/heatmap'; // Import the heatmap module
import numeral from 'numeral';
import _ from 'lodash';
import {
    ChartColumn,
    ChartConfig,
    ChartModel,
    ChartToTSEvent,
    ColumnType,
    CustomChartContext,
    DataPointsArray,
    getChartContext,
    Query,
} from '@thoughtspot/ts-chart-sdk';
import HighchartsCustomEvents from 'highcharts-custom-events';

// Initialize Highcharts Treemap, Heatmap, Exporting, and Offline Exporting modules
Exporting(Highcharts);
OfflineExporting(Highcharts); // Initialize offline exporting
Treemap(Highcharts);
Heatmap(Highcharts);
HighchartsCustomEvents(Highcharts);


// Extend Highcharts to include tooltipData
declare module 'highcharts' {
    interface PointOptionsObject {
        tooltipData?: Array<{ columnName: string, value: number }>;
        labelData?: Array<{ columnName: string, value: number }>; // Added labelData
    }
}

let userNumberFormat = '0.0'; // Default number format
let numberOfLabels = 1; // Default to showing labels for the top 1 point

// Default gradient colors
let gradientColor0 = '#FDB4E5'; // Light gray for 0%
let gradientColor50 = '#A8D5BA'; // Soft green for 50%
let gradientColor100 = '#4F6D7A'; // Muted teal for 100%

// Interface for visualProps
interface VisualProps {
    numberFormat: string;
    numOfLabels: number;
    gradientColor0: string;
    gradientColor50: string;
    gradientColor100: string;
}

// Custom Number Formatter for formatting values in the chart and tooltip
const numberFormatter = (value: number, format = '0.0') => {
    try {
        const abbreviationFormat = format + 'a'; // Example: '0.0a' for one decimal place with abbreviation
        let formattedValue = numeral(value).format(abbreviationFormat);
        formattedValue = formattedValue.replace('k', 'K').replace('m', 'M').replace('b', 'B');
        return formattedValue;
    } catch (error) {
        console.error("Error in numberFormatter: ", error);
        return value.toString();
    }
};

// Function to get dynamic tick positions based on data range
function getTickPositions(minValue: number, maxValue: number, numTicks: number = 5) {
    console.log("Calculating tick positions...");
    try {
        const tickInterval = (maxValue - minValue) / (numTicks - 1);
        const tickPositions: number[] = [];
        for (let i = 0; i < numTicks; i++) {
            tickPositions.push(minValue + i * tickInterval);
        }
        return tickPositions;
    } catch (error) {
        console.error("Error in getTickPositions: ", error);
        return [];
    }
}

// Function to get the data model from the chart model
function getDataModel(chartModel: ChartModel) {
    console.log("Extracting data model from chartModel: ", chartModel);
    try {
        const configDimensions = chartModel.config?.chartConfig?.[1]?.dimensions ?? chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

        const dataArr = chartModel.data?.[0]?.data ?? undefined;

        if (!dataArr) {
            console.error('No data found in chartModel');
            return { values: [] };
        }

        const categoryColumn = configDimensions?.[0]?.columns?.[0]; // First attribute (x-axis)
        const measureColumns = _.filter(chartModel.columns, col => col.type === ColumnType.MEASURE);

        // Get additional configuration for size, color, labels, and tooltip columns
        const sizeMeasureCol = configDimensions[1]?.columns?.[0];
        const colorMeasureCol = configDimensions[2]?.columns?.[0];
        const labelMeasureArr = configDimensions[3]?.columns || [];
        const tooltipArr = configDimensions[4]?.columns || [];

        // Merging label and tooltip arrays as required
        const tooltipArrFinal = _.concat(sizeMeasureCol, colorMeasureCol, labelMeasureArr, tooltipArr);
        const labelMeasureArrFinal = _.concat(sizeMeasureCol, colorMeasureCol, labelMeasureArr);

        const categoryColumnIndex = dataArr.columns.findIndex(col => col === categoryColumn?.id);
        const sizeColumnIndex = dataArr.columns.findIndex(col => col === sizeMeasureCol?.id);
        const colorColumnIndex = dataArr.columns.findIndex(col => col === colorMeasureCol?.id);

        if (!categoryColumn || measureColumns.length === 0) {
            console.error('The chart requires a category and at least one measure.');
            return { values: [] };
        }

        const dataModel = dataArr.dataValue.map((row) => {
            const categoryName = row[categoryColumnIndex];
            const sizeMeasureValue = parseFloat(row[sizeColumnIndex]);
            const colorMeasureValue = parseFloat(row[colorColumnIndex]);

            const tooltipData = tooltipArrFinal.map((col) => ({
                columnName: col.name,
                value: row[dataArr.columns.findIndex(c => c === col.id)],
            }));

            const labelData = labelMeasureArrFinal.map((col) => ({
                columnName: col.name,
                value: row[dataArr.columns.findIndex(c => c === col.id)],
            }));

            const chartDataPoint = {
                name: categoryName !== undefined ? categoryName.toString() : 'Unnamed',
                value: sizeMeasureValue,
                colorValue: colorMeasureValue,
                tooltipData: tooltipData,
                labelData: labelData, // Add labelData to the point object
            };
            return chartDataPoint;
        });

        dataModel.sort((a, b) => b.value - a.value);
        return {
            values: dataModel,
            categoryName: categoryColumn?.name,
            measureColumns: measureColumns.map(col => col.name),
        };
    } catch (error) {
        console.error("Error in getDataModel: ", error);
        return { values: [] };
    }
}

// Function to download the chart as a PNG using Highcharts offline exporting module
function downloadChartAsPNG(chartInstance: any) {
    chartInstance.exportChartLocal({
        type: 'image/png',
        filename: 'treemap-chart',
    });
}

// Function to get parsed event details
function getParsedEvent(evt: any) {
    return {
        clientX: evt.clientX || evt.point.pageX,
        clientY: evt.clientY || evt.point.pageY
    };
}

// Function to render the treemap chart
function render(ctx: CustomChartContext) {
    console.log("Rendering the chart...");
    try {
        const chartModel = ctx.getChartModel();
        if (!chartModel) {
            console.error("chartModel is undefined");
            return;
        }
        const configDimensions = chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

        const dataModel = getDataModel(chartModel);

        if (dataModel.values.length === 0) {
            console.error('No valid data to render.');
            return;
        }

        const visualProps = chartModel.visualProps as VisualProps;
        userNumberFormat = visualProps.numberFormat || userNumberFormat;
        numberOfLabels = visualProps.numOfLabels || numberOfLabels;
        gradientColor0 = visualProps.gradientColor0 || gradientColor0;
        gradientColor50 = visualProps.gradientColor50 || gradientColor50;
        gradientColor100 = visualProps.gradientColor100 || gradientColor100;

        const minColorValue = Math.min(...dataModel.values.map(d => d.colorValue));
        const maxColorValue = Math.max(...dataModel.values.map(d => d.colorValue));


        
        const chartInstance = Highcharts.chart({
            chart: {
                renderTo: 'chart',
                spacingBottom: 0,
                events: {
                    load: function () {
                        console.log("Chart loaded successfully");

                        // Add right-click (context menu) event listener
                        this.container.addEventListener('contextmenu', function(event) {
                            // Prevent the default browser right-click menu
                            event.preventDefault();

                            // Create a PointerEvent from MouseEvent
                            const pointerEvent = new PointerEvent('pointerdown', {
                                clientX: event.clientX,
                                clientY: event.clientY,
                                pointerType: 'mouse',
                            });

                            const clickedPoint = chartInstance.series[0].searchPoint(pointerEvent, true); // Search for the clicked point
                            if (clickedPoint) {
                                // Trigger the ThoughtSpot context menu here
                                ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                    event: getParsedEvent(event),
                                    clickedPoint: {
                                        tuple: [
                                            { columnId: configDimensions?.[0]?.columns?.[0]?.id, value: clickedPoint.name },
                                            { columnId: configDimensions?.[1]?.columns?.[0]?.id, value: clickedPoint.value },
                                            { columnId: configDimensions?.[2]?.columns?.[0]?.id, value: clickedPoint.options.colorValue }
                                        ],
                                    },
                                });
                            }
                        });
                    }
                }
            },
            series: [{
                type: 'treemap',
                layoutAlgorithm: 'squarified',
                data: dataModel.values.map(dataPoint => ({
                    ...dataPoint,
                    colorValue: dataPoint.colorValue
                })),
                dataLabels: {
                    enabled: true,
                    align: 'center',
                    useHTML: false,  // SVG rendering, so keep useHTML false
                    formatter: function () {
                        const point: Highcharts.PointOptionsObject = this.point;  // Get the current point for labeling
                        
                        let labelHtml = point.name + "<br>"   ;               
                        
                        // Loop through labelData and append label content if applicable
                        if (this.point.index < numberOfLabels) {
                            point.labelData?.forEach(labelCol => {
                                // labelHtml+=labelCol.columnName+": " +numberFormatter(labelCol.value, userNumberFormat)+"<br>";
                                labelHtml += `<tspan onclick="console.log('Clicked on: ${labelCol.columnName}')" 
                                pointer-events="auto"> 
                                ${labelCol.columnName}: ${numberFormatter(labelCol.value, userNumberFormat)} </tspan><br>`;
                            });
                        }
                        return labelHtml;
                    },
                    style: {
                        fontFamily: 'optimo-plain, "Helvetica Neue", Helvetica, Arial, sans-serif',
                        fontWeight: '500',
                        color: '#5e5e5e',
                        fontSize: '12px',
                        textOutline: '1.6px white',
                        textShadow: 'rgba(255, 255, 255, 0.6) 0px 0px 2px'
                    },
                    events: {
                        click: function (event) {
                            console.log('Label clicked:', this.point.name);
                            // Add any additional logic here if required
                        },
                        contextmenu: function (event) {
                            event.preventDefault(); // Prevent browser's default context menu
                            const point = this.point;
                
                            // Emit the ThoughtSpot context menu event
                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: getParsedEvent(event),
                                clickedPoint: {
                                    tuple: [
                                        { columnId: configDimensions?.[0]?.columns?.[0]?.id, value: point.name },
                                        { columnId: configDimensions?.[1]?.columns?.[0]?.id, value: point.value },
                                        { columnId: configDimensions?.[2]?.columns?.[0]?.id, value: point.colorValue }
                                    ],
                                },
                            });
                        }
                    }
                },
                point: {
                    events: {
                        contextmenu: function (e) {
                            e.preventDefault();
                            const clickedPointDetails = this;
                            const categoryValue = clickedPointDetails.name;
                            const measureValue = clickedPointDetails.value;
                            const colorValue = clickedPointDetails.options.colorValue;
                            debugger;

                            
                            ctx.emitEvent(ChartToTSEvent.OpenContextMenu, {
                                event: getParsedEvent(e),

                                clickedPoint: {
                                    tuple: [
                                        { columnId: configDimensions?.[0]?.columns?.[0]?.id, value: categoryValue },
                                        { columnId: configDimensions?.[1]?.columns?.[0]?.id, value: measureValue },
                                        { columnId: configDimensions?.[2]?.columns?.[0]?.id, value: colorValue }
                                    ],
                                },
                            });
                        }
                    }
                }
            }] as any,
            title: {
                text: '',
            },
            //
            colorAxis: {
                width: '50%',
                minColor: gradientColor0,
                maxColor: gradientColor100,
                stops: [
                    [0, gradientColor0],
                    [0.5, gradientColor50],
                    [1, gradientColor100]
                ],
                labels: {
                    formatter: function () {
                        const value = typeof this.value === 'string' ? parseFloat(this.value) : this.value;
                        return numberFormatter(value, userNumberFormat);
                    },
                },
            },

            legend: {
                title: {
                    text: configDimensions[2]?.columns?.[0].name,
                    style: {
                        fontFamily: 'Helvetica',
                        fontSize: '11px'
                    }
                },
                layout: 'horizontal',
                align: 'center',
                verticalAlign: 'bottom'
            },
            credits: {
                enabled: false 
            },
            exporting: {
                enabled: false
            },
            tooltip: {
                followPointer: true,
                padding: 10, // Padding inside the tooltip for better spacing
                shadow: true, // Enable a shadow for better visibility
                backgroundColor: '#3A3F48', // Dark background color
                borderColor: '#FFD700', // A subtle gold-like border (based on the border seen in the image)
                borderRadius: 4, // Slightly rounded corners
                borderWidth: 1, // Thin border
                style: {
                    color: '#FFFFFF', // White text
                    fontSize: '12px', // Font size similar to the image
                    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', // Sans-serif font
                    fontWeight: 'normal', // Normal font-weight for value text
                    textAlign: 'left', // Left-align the text
                },
                
                useHTML: true,
                pointFormatter: function () {
                    const point = this;
                    const options = point.options;
                    let tooltipHtml = dataModel.categoryName+": "+"<br>"+point.name + "<br>"+"<br>";
                    if (options.tooltipData && Array.isArray(options.tooltipData)) {
                        options.tooltipData.forEach((tooltipCol) => {
                            tooltipHtml += tooltipCol.columnName+": "+"<br>" +numberFormatter(tooltipCol.value, userNumberFormat)+ "<br>"+"<br>";
                        });
                    }
                    return tooltipHtml;
                }

            }
        });
    } catch (error) {
        console.error('Render failed: ', error);
    }
}

// Function to render the chart
const renderChart = async (ctx: CustomChartContext): Promise<void> => {
    try {
        ctx.emitEvent(ChartToTSEvent.RenderStart);
        render(ctx);
    } catch (error) {
        console.error('Error during renderChart: ', error);
        ctx.emitEvent(ChartToTSEvent.RenderError, {
            hasError: true,
            error: error,
        });
    } finally {
        ctx.emitEvent(ChartToTSEvent.RenderComplete);
    }
};

// Immediately Invoked Async Function (IIFE) to initialize and render the chart
(async () => {
    console.log("IIFE Started");
    try {
        const ctx = await getChartContext({
            getDefaultChartConfig: (chartModel: ChartModel): ChartConfig[] => {
                console.log("Generating default chart configuration...");

                const cols = chartModel.columns ?? [];
                const attributeColumns = _.filter(cols, (col) => col.type === ColumnType.ATTRIBUTE);
                const measureColumns = _.filter(cols, (col) => col.type === ColumnType.MEASURE);

                if (attributeColumns.length === 0 || measureColumns.length === 0) {
                    throw new Error("Missing required attribute or measure columns.");
                }

                return [{
                    key: 'column',
                    dimensions: [
                        {
                            key: 'category', // x-axis (category)
                            columns: attributeColumns.length > 0 ? [attributeColumns[0]] : [],
                        },
                        {
                            key: 'measure', // y-axis (measure)
                            columns: measureColumns.length > 0 ? [measureColumns[0]] : [],
                        },
                        {
                            key: 'coloraxis', // Color axis
                            columns: measureColumns.length > 1 ? [measureColumns[1]] : [],
                        },
                        {
                            key: 'Labels', // Optional labels
                            columns: measureColumns.length > 2 ? measureColumns.slice(2, 4) : [],
                        },
                        {
                            key: 'tooltips', // Tooltip columns
                            columns: measureColumns.length > 4 ? measureColumns.slice(4) : [],
                        },
                    ],
                }];
            },
            getQueriesFromChartConfig: (chartConfig: ChartConfig[]): Array<Query> => {
                return chartConfig.map((config: ChartConfig): Query =>
                    _.reduce(
                        config.dimensions,
                        (acc: Query, dimension) => ({
                            queryColumns: [...acc.queryColumns, ...dimension.columns],
                        }),
                        { queryColumns: [] } as Query,
                    ),
                );
            },
            renderChart: (ctx) => renderChart(ctx),
            chartConfigEditorDefinition: [
                {
                    key: 'column',
                    label: 'Treemap Configuration',
                    descriptionText: 'Select category, measure, color axis, and tooltip columns.',
                    columnSections: [
                        {
                            key: 'category',
                            label: 'Category (x-axis)',
                            allowAttributeColumns: true,
                            allowMeasureColumns: false,
                            maxColumnCount: 1,
                        },
                        {
                            key: 'measure',
                            label: 'Measure (y-axis)',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            maxColumnCount: 1,
                        },
                        {
                            key: 'coloraxis',
                            label: 'Color Axis',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                        },
                        {
                            key: 'Labels',
                            label: 'Labels',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            maxColumnCount: 2,
                        },
                        {
                            key: 'tooltips',
                            label: 'Tooltip Columns',
                            allowAttributeColumns: false,
                            allowMeasureColumns: true,
                            maxColumnCount: 5,
                        },
                    ],
                },
            ],
            visualPropEditorDefinition: {
                elements: [
                    {
                        key: 'numberFormat',
                        type: 'text',
                        defaultValue: '0.0',
                        label: 'Number Format',
                    },
                    {
                        key: 'numOfLabels',
                        type: 'number',
                        defaultValue: 1,
                        label: 'No. of Points to be Labeled',
                    },
                    {
                        key: 'gradientColor0',
                        type: 'colorpicker',
                        defaultValue: '#FFFFFF',
                        label: 'Color for 0%',
                    },
                    {
                        key: 'gradientColor50',
                        type: 'colorpicker',
                        defaultValue: '#FFCC00',
                        label: 'Color for 50%',
                    },
                    {
                        key: 'gradientColor100',
                        type: 'colorpicker',
                        defaultValue: '#FF0000',
                        label: 'Color for 100%',
                    },
                ],
            },
            allowedConfigurations: {
                allowColumnConditionalFormatting: true
            }
        });

        renderChart(ctx);
    } catch (error) {
        console.error('Error during initialization: ', error);
    }
})();
