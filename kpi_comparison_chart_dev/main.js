import {
  ChartToTSEvent,
  ColumnType,
  getChartContext,
} from '@thoughtspot/ts-chart-sdk';
import _ from 'lodash';
import numeral from 'numeral';


const visualPropKeyMap = {
  0: 'numberFormat',
  1: 'Variance',
  2: 'bps',
  3: 'Options',
};

let userNumberFormat = '0.0'; // Default format if not specified by the user

const userNumberFormatter = (value, format) => {
  return numeral(value).format(format);
};


// ✅ Number formatter with full currency and abbreviations (for KPI and comparison values)
const numberFormatterWithCurrency = (value, format = '') => {
  if (!format) return value.toString();
  let formattedValue = numeral(value).format(format);

  if (value > 1000000000 || value < -1000000000) {
    formattedValue = numeral(value / 1000000000).format(format) + 'B';
  } else if (value > 1000000 || value < -1000000) {
    formattedValue = numeral(value / 1000000).format(format) + 'M';
  } else if (value > 1000 || value < -1000) {
    formattedValue = numeral(value / 1000).format(format) + 'K';
  }
  
  return formattedValue;
};


// ✅ Formatter WITHOUT currency, but controls abbreviation for Change% and BPS
const numberFormatterNoCurrency = (value, format = '', isChangeOrBps = false) => {
  if (!format) return value.toString();

  let formattedValue = numeral(value).format(format);

  // Remove currency symbols, keeping decimal precision
  formattedValue = formattedValue.replace(/[^0-9.,-]/g, '');

  // ✅ ONLY apply K/M/B for comparison values, NOT for Change% or BPS
  if (!isChangeOrBps) {
    if (value > 1000000000 || value < -1000000000) {
      formattedValue = numeral(value / 1000000000).format(format) + 'B';
    } else if (value > 1000000 || value < -1000000) {
      formattedValue = numeral(value / 1000000).format(format) + 'M';
    } else if (value > 1000 || value < -1000) {
      formattedValue = numeral(value / 1000).format(format) + 'K';
    }
  }

  return formattedValue;
};






function getDataForColumn(column, dataArr) {
  const idx = _.findIndex(dataArr.columns, (colId) => column.id === colId);
  return _.map(dataArr.dataValue, (row) => row[idx]);
}




function calculateKpiValues(chartModel, showVariance) {
  showVariance = chartModel.visualProps.Variance;
  console.log('Variance setting in KPI Calculation:', showVariance); // ✅ Logs before calculations

  const dataArr = chartModel.data?.[0]?.data ?? [];
  const measureColumns = _.filter(
      chartModel.columns,
      (col) => col.type === ColumnType.MEASURE
  );

  if (measureColumns.length === 0 || dataArr.length === 0)
      return { mainKpiValue: 0, measures: [] };

  const configDimensions = chartModel.config?.chartConfig?.[1]?.dimensions ?? 
                           chartModel.config?.chartConfig?.[0]?.dimensions ?? [];

  const mainKpiColumn = configDimensions.find((it) => it.key === 'x');
  const mainKpiColumnId = mainKpiColumn?.columns?.[0]?.id;
  const mainKpiValue = mainKpiColumnId ? _.sum(getDataForColumn(mainKpiColumn.columns[0], dataArr)) : 0;

  const comparisonMeasures = measureColumns.filter((col) =>
      col.id !== mainKpiColumnId &&
      configDimensions.some(dimension => dimension.columns.some(c => c.id === col.id))
  );

  const measures = comparisonMeasures.map((col) => {
      const value = _.sum(getDataForColumn(col, dataArr));

      const variance = (value == null || mainKpiValue == null) ? null : mainKpiValue - value;
      // ✅ Compute variance correctly

      const change = (mainKpiValue == null || value == null)
      ? null
      : showVariance
        ? mainKpiValue - value
        : value !== 0
          ? ((mainKpiValue - value) / (value)) * 100
          : null;
    
      const bps = ((mainKpiValue == null || value == null)
      ? null
      : showVariance
        ? mainKpiValue - value
        : value !== 0
          ? ((mainKpiValue - value) / (value)) * 100
          : null)*100;

      return { label: col.name, value, change,variance,bps };
  });

  return { mainKpiValue, measures };
}


function updateKpiContainer(measures, mainKpiValue, format, isVarianceChecked, isBpsChecked) {
  // ✅ Format the Main KPI Value (Always with currency)
  document.getElementById('mainKpiValue').innerText = numberFormatterWithCurrency(mainKpiValue, format);

  const kpiContainer = document.getElementById('kpiMeasures');
  kpiContainer.innerHTML = ''; // Clear previous content

  measures.forEach((measure) => {
    let displayValue;
    let formattedComparisonValue = numberFormatterWithCurrency(measure.value, format); // ✅ Keep currency

    if (isVarianceChecked) {
      displayValue = (measure.variance == null || measure.variance === 0) ? '' : numberFormatterWithCurrency(measure.variance, format);
    } else if (isBpsChecked) {
      displayValue = numberFormatterNoCurrency(measure.bps, format, true) + " bps"; // ✅ No currency, no K/M/B
    } else {
      displayValue = numberFormatterNoCurrency(measure.change, format, true) + '%'; // ✅ No currency, no K/M/B
    }

    // ✅ Correct logic for positive/negative styling
    const changeClass = (isVarianceChecked ? measure.variance > 0 : isBpsChecked ? measure.bps > 0 : measure.change > 0)
      ? 'kpi-positive'
      : 'kpi-negative';
    const arrow = (isVarianceChecked ? measure.variance > 0 : isBpsChecked ? measure.bps > 0 : measure.change > 0) 
      ? '↑' 
      : '↓';

    // ✅ Create KPI Measure Row
    const measureDiv = document.createElement('div');
    measureDiv.classList.add('kpi-measure');

    measureDiv.innerHTML = `
      <span class="${changeClass}">${arrow} ${displayValue}</span>
      <span class="comparisonKPIAbsoluteValue">(${formattedComparisonValue})</span> 
      <span class="comparisonKPIName">vs. ${measure.label}</span>
    `;

    kpiContainer.appendChild(measureDiv);
  });
}




function insertCustomFont(customFontFaces) {
  customFontFaces.forEach((it) => {
    const font = new FontFace(it.family, `url(${it.url})`);
    document.fonts.add(font);
  });
}

async function render(ctx) {
  const chartModel = await ctx.getChartModel();
  const appConfig = ctx.getAppConfig();

  if (appConfig?.styleConfig?.customFontFaces?.length) {
    insertCustomFont(appConfig.styleConfig.customFontFaces);
  }

  // Read number format and variance checkbox value
  const numberFormat = chartModel.visualProps.numberFormat || userNumberFormat;
  const isVarianceChecked = chartModel.visualProps.Variance || false;
  const isBpsChecked = chartModel.visualProps.bps || false;

  const kpiValues = calculateKpiValues(chartModel);
  updateKpiContainer(kpiValues.measures, kpiValues.mainKpiValue, numberFormat, isVarianceChecked, isBpsChecked);
}





const renderChart = async (ctx) => {
  try {
    ctx.emitEvent(ChartToTSEvent.RenderStart);
    await render(ctx);
  } catch (e) {
    ctx.emitEvent(ChartToTSEvent.RenderError, { hasError: true, error: e });
  } finally {
    ctx.emitEvent(ChartToTSEvent.RenderComplete);
  }
};

(async () => {
  const ctx = await getChartContext({
    getDefaultChartConfig: (chartModel) => {
      const cols = chartModel.columns;
      const measureColumns = _.filter(
        cols,
        (col) => col.type === ColumnType.MEASURE
      );
      const axisConfig = {
        key: 'column',
        dimensions: [
          {
            key: 'x',
            columns: measureColumns.length > 0 ? [measureColumns[0]] : [],
          },
          {
            key: 'y',
            columns: measureColumns.length > 1 ? measureColumns.slice(1) : [],
          },
        ],
      };
      return [axisConfig];
    },
    getQueriesFromChartConfig: (chartConfig) => {
      return chartConfig.map((config) =>
        _.reduce(
          config.dimensions,
          (acc, dimension) => ({
            queryColumns: [...acc.queryColumns, ...dimension.columns],
          }),
          { queryColumns: [] }
        )
      );
    },
    renderChart,
    chartConfigEditorDefinition: [
      {
        key: 'column',
        label: 'Custom Column',
        descriptionText:
          'This chart accepts only measures. At least 2 measures are required. Measure in the Main KPI will show the value displayed as big number.' +
          'The measures under Comparison measures will appear under the main KPI along with variance(s).',
        columnSections: [
          {
            key: 'x',
            label: 'Main KPI measure',
            allowAttributeColumns: false,
            allowMeasureColumns: true,
            allowTimeSeriesColumns: true,
            maxColumnCount: 1,
          },
          {
            key: 'y',
            label: 'Comparison measures',
            allowAttributeColumns: false,
            allowMeasureColumns: true,
            allowTimeSeriesColumns: false,
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
          key: 'Change%', // ✅ Default checked
          type: 'checkbox',
          defaultValue: true,
          label: ' Click to select Change%',
        },
        {
          key: 'Variance',
          type: 'checkbox',
          defaultValue: false,
          label: 'Click to select Variance',
        },
        {
          key: 'bps',
          type: 'checkbox',
          defaultValue: false,
          label: 'Click to select bps',
        },
      ],
    },
    onPropChange: (propKey, propValue) => {
      if (propKey === 'numberFormat') {
        userNumberFormat = propValue || '0.0';
        console.log('Number format updated to:', userNumberFormat); // Debugging line
        renderChart(ctx); // Re-render the chart with the new format
      }  else if (propKey === 'Change%') {
        console.log('Variance checkbox state changed:', propValue);
        renderChart(ctx);
      }  else if (propKey === 'Variance') {
        console.log('Variance checkbox state changed:', propValue);
        renderChart(ctx);
      }  else if (propKey === 'bps') {
        console.log('BPS checkbox state changed:', propValue);
        renderChart(ctx);
      } else if (propKey === 'columnOrder' || propKey.startsWith('column')) {
        renderChart(ctx);
      }
    },
  });

  renderChart(ctx);
})();