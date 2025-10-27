<p align="center">
    <img src="https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/TS-Logo-black-no-bg.svg" width=120 align="center" alt="ThoughtSpot" />
</p>

<br/>


# BYOC Implementation - Overview and Working Details <br/>

Bring Your Own Charts (BYOC) is a framework in ThoughtSpot to implement your own custom charts leveraging the ThoughtSpot charts SDK. Custom charts can be created to support the functionality not available using the out-of-the-box chart options in ThoughtSpot. Developers can use JavaScript or TypeScript to develop these custom charts. Charts from popular libraries such as HighCharts, D3, etc., can be used as reference and modified to work with TS Charts SDK.

## Get Started

This tutorial demonstrates how to use a KPI Comparison Chart using JavaScript.

Before you begin, check for the following requirements:

- Access to a ThoughtSpot Cloud application instance
- A Development Environment (IDE) for building custom charts
- Working knowledge of JavaScript or TypeScript
- Familiarity with charting libraries such as Highcharts
- Knowledge of the chart type

## Set Up Your Environment for BYOC (Bring Your Own Code)

### Prepare Your Development Environment

1. **Install Node.js and npm** - Node.js and npm (Node Package Manager) are required for most JavaScript-based projects.

### Set Up Your Code Repository

1. **Initialize a Git Repository:**
   - Git is the most widely used version control system.
   - **Install Git:**
     - Download Git from the [Git website](https://git-scm.com/downloads).
     - Install Git by following the on-screen instructions.

### Set Up Dependencies and Environment

1. **Create a `package.json` File for Node.js Projects.** This file manages dependencies and scripts for your project.
   
2. **Set Up Your Code Repository**
    - Initialize a Git Repository:
    - Git is the most widely used version control system.
    **Install Git:**
    - Download Git from the Git website.
    - Install Git by following the on-screen instructions.

3. **Set Up Dependencies and Environment**
    - Create a package.json File for Node.js Projects. This file manages dependencies and scripts for your project.


## Install lodash

    npm install lodash

## Install the SDK

    npm install --save @thoughtspot/ts-chart-sdk

## Render a chart on your local environment

Render a chart in the application created from the preceding steps.
This tutorial uses JavaScript code to create a [Custom KPI comparison chart](https://github.com/thoughtspot/ps_byoc).  

## Implement the Chart Code

To implement the chart code in your application, complete these steps:

1. Visit the Thoughtspot repository which has the code for [kpi-comparison-chart](https://github.com/thoughtspot/ps_byoc). 

2. Download the repository from Git to a local repository. 
**You can directly use the files in the repository to create the kpi-comparison-chart or you can build a chart of your own using JavaScript.**

3. You will need the following main components in your Github repository to generate a custom chart 

- **main.js** - This file contains your main JavaScript code. This will be the source code on which the custom chart runs.
- **Index.html** - This file serves as the entry point for your web application, loading essential resources and defining the initial structure for dynamic content rendering.
- **Style.css** - This file is used to define the visual presentation (styles) of the HTML elements in your web application, ensuring a consistent and visually appealing layout.
- **Package.json (optional)** - The package.json file manages project metadata, dependencies, and scripts in a Node.js project.
- **Manifest.json (optional)** - The manifest.json file provides metadata for web applications, specifying how they should behave when installed on a device or accessed in a browser.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Repository%20files.png" width=650 height=330 align="center" alt="Files" />
</p>


There are 3 main components in your JavaScript/TypeScript code that allow your custom chart elements to interact with data from TS using the chart SDK. They are as follows:

1. Initialize the Chart Context
2. Create a data model from input data
3. Plug data into the Charts datasets

## Initialize the Chart Context

Chart Context is the main context object that helps in orchestrating ThoughtSpot APIs to render charts. It also acts as a core central point of all interactions on the charts.

To initialize the chart context, call *getChartContext()*:

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Chart%20Context.png" width=950 height=550 align="center" alt="getchartContext()" />
</p>


NOTE: For more information about the chart context component, refer to the following documentation resources:

- [https://ts-chart-sdk-docs.vercel.app/types/CustomChartContextProps.html](https://ts-chart-sdk-docs.vercel.app/types/CustomChartContextProps.html)
- [https://github.com/thoughtspot/ts-chart-sdk/blob/main/src/main/custom-chart-context.ts#L40](https://github.com/thoughtspot/ts-chart-sdk/blob/main/src/main/custom-chart-context.ts#L40)


The custom chart context component must include the following mandatory properties to function:

- getDefaultChartConfig (Doc)
- getQueriesFromChartConfig (Doc)
- renderChart (Doc)

#### getDefaultChartConfig (Doc)

This function takes in a ChartModel object and returns a well-formed point configuration definition.

Ensure that the getDefaultChartConfig method is included in chartContext to define the configuration of the columns that are required to map the dataset into the chart. We assume that the order of the column is maintained in the chartModel.

To render the chart, the default configuration is required.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Default%20Chart%20Config.png" width=950 height=450 align="center" alt="defaultchartConfig()" />
</p>


#### getQueriesFromChartConfig (Doc)

This method defines the data query that is required to fetch the data from ThoughtSpot to render the chart. For most use cases, you do not require the data outside of the columns listed in your chart.

This example maps all the columns in the configuration as an array of columns in the arguments.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/getQueriesfromChartConfig.png" width=950 height=200 align="center" alt="defaultchartConfig()" />
</p>

#### renderChart (Doc)

This renderChart (Doc) function is required to render the chart implemented in your code. This function ensures that every time chartContext tries to re-render the chart due to the changes in data or chart model, the chart rendered in your application is updated.

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Render.png" width=950 height=700 align="center" alt="Render()" />
</p>

## Create a Data Model from input data

The data model is unique to every chart. It defines how each point will be plotted on the chart. This example shows how the model for kpi-comparison-chart is used to get the main KPI and comparison measures 

<p align="center">
    <img src="https://github.com/thoughtspot/ps_byoc/blob/main/kpi_comparison_chart/images/Chart%20Model.png" width=950 height=450 align="center" alt="ChartModel()" />
</p>


## Plug data into the Chart datasets

Use the data model created from the above function and plug the values into the Chart configuration to render the chart.

Create a data model object.
In your renderChart code, add the following lines:

    - const chartModel = await ctx.getChartModel(); 

The command const chartModel = await ctx.getChartModel() is an asynchronous function call that retrieves the current chart model from the context object (ctx). This chart model contains the data, configuration, and properties of the chart that is being rendered. 


    - const kpiValues = calculateKpiValues(chartModel);

The command const kpiValues = calculateKpiValues(chartModel) calls the calculateKpiValues function, passing the chartModel as an argument, and assigns the result to the kpiValues constant.


Here’s the full code to implement the [kpi-comparison-chart](https://github.com/thoughtspot/ps_byoc/tree/main/kpi_comparison_chart). 

## Deploy your chart

If the chart creation is successful, you can host it on a server and make it available for use:

To deploy your charts, you can use Vercel, Netlify, or any server that can render an HTML page. For information, see [deployment guide](https://docs.google.com/document/d/1DDJPqAwdfkCfNn49oHrH26YI1-idLPgH5409PsyWNAY/edit?usp=sharing).


## Additional Resources
- [BYOC Tutorial](https://github.com/thoughtspot/ts-chart-sdk)
- [High Chart Demo Link](https://www.highcharts.com/demo/gantt/progress-indicator)
- [JSFiddle Link](https://jsfiddle.net/gh/get/library/pure/highcharts/highcharts/tree/master/samples/gantt/demo/progress-indicator)
