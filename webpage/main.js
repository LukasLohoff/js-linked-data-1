// Map config
var cityCenter = [51.960942, 7.625891]; // Coords of the city center of Münster
var zoomLevel = 11; // Initial zoom level of Münster

// HTML config
var yearSliderId = "#year-slider";
var yearValueId = "#year";
var mapIdn = "map";
var diagramId = "#chart";
var criteriaId = "#criteria";
var districtId = "#bound_districts";
var boroughId = "#bound_boroughs";
var legend1Id = "#legend1";
var legend2Id = "#legend2";
var legend3Id = "#legend3";
var navbarId = "#navbar";
var dataListIdn = "dataList";
var helpButtonId = "#helpButton";

// JS config
var map = null;
var features = [];
var wkt = new Wkt.Wkt();

// Other config
var sparqlUrl = "http://giv-lodumdata.uni-muenster.de:8282/parliament/sparql?output=JSON&query=";
var minYear = 2010;
var maxYear = 2014;

// SPARQL
var sqlPrefixes = "\
prefix dc: <http://purl.org/dc/elements/1.1/>\n\
prefix geo: <http://www.opengis.net/ont/geosparql#>\n\
prefix lodcom: <http://vocab.lodcom.de/>\n\
prefix dbpedia: <http://dbpedia.org/page/classes#>\n\
prefix rdfs:    <http://www.w3.org/TR/rdf-schema/> \n\
prefix xsd: <http://www.w3.org/2001/XMLSchema#>\n";

// Precalculating data
var years = [];
for (var y = minYear; y <= maxYear; y++) {
	years.push(y);
}

/**
 * Initializing the webpage (onload).
 */
//
$(function () {
	// Init map
	map = L.map(mapIdn).setView(cityCenter, zoomLevel);
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);
	// When the popup opens load the chart
	map.on('popupopen', function () {
		var areaName = $(diagramId).data('name');
		requestChartData(areaName);
		requestMoreData(areaName)
	});
	resizeMap();
	$(window).resize(resizeMap);

	// Init year slider
	$(yearSliderId).slider({
		value: maxYear,
		min: minYear,
		max: maxYear,
		step: 1,
		slide: function (event, ui) {
			$(yearValueId).text(ui.value);
			setTimeout(requestMapData, 100);
		}
	});
	$(districtId).change(requestMapData);
	$(boroughId).change(requestMapData);
	$(criteriaId).change(requestMapData);
	$(helpButtonId).on( "click", function( event ) {
    event.preventDefault();
    startIntro();
	});

	$(yearValueId).text($(yearSliderId).slider("value"));
	requestMapData();
});

/**
 * Resized the map to fit the current viewport.
 *
 * @returns void
 */
function resizeMap() {
	// Set height to nearly 100%
	$("#" + mapIdn).height($(window).height() - $(navbarId).height() - 40); // 40 = two times the margin of #navbar
	map.invalidateSize();
}

/**
 * Sends the specified SPARQL query to the Triple Store database and after a successful call pass the
 * retrieved data to the given callback function.
 *
 * @param string query
 * @param function callbackSuccess
 * @returns void
 */
function askTripleStore(query, callbackSuccess) {
	console.log(query);
	var url = sparqlUrl + encodeURIComponent(query); // encodeURI is not enough as it doesn't enocde # for example.
	$.ajax({
		dataType: "jsonp",
		url: url,
		success: callbackSuccess
	});
}

/**
 * Requests the data for the map view and displays it on the web page.
 *
 * @returns {void}
 */
function requestMapData() {
	askTripleStore(buildQuerySingleYear(), updateData);
}

/**
 * Requests the data for the chart and shows it on the web page.
 *
 * @param {string} areaName
 * @returns {void}
 */
function requestChartData(areaName) {
	var criteriaValue = $(criteriaId).val();
	askTripleStore(buildQueryAllYears(areaName, criteriaValue), function (data) {
		updateChart(areaName, criteriaValue, data);
	});
}

/**
 * Requests the data for the additional information view and shows it on the web page.
 *
 * @param {string} areaName
 * @returns {void}
 */
function requestMoreData(areaName) {
	askTripleStore(buildQueryMoreData(areaName), function (data) {
		updateMoreData(areaName, data);
	});
}

/**
 * Gets a human readable title for the specified criteria (see the possible values of the corresponding select field).
 *
 * @param {string} criteriaValue
 * @returns {string}
 */
function getCurrentCriteriaName(criteriaValue) {
	switch (criteriaValue) {
		case "Male":
		case "Female":
			return "by gender: " + criteriaValue;
		case "Longtime":
			return "by duration: Long-time unemployment";
		case "Foreign":
			return "by origin: Foreigners";
		case "Olderthan55":
			return "by age: Older than 55 years";
		case "Youngerthan25":
			return "by age: Younger than 25 years";
		case "Between25and55":
			return "by age: 25 to 55 years";
		default:
			return "";
	}
}

/**
* Builds the query to retrieve the data for the main map view, which is actually the data for all areas
* according to the selected criteria, year etc.

 * @returns {string} */
function buildQuerySingleYear() {
	var yearValue = $(yearSliderId).slider("value");
	if (yearValue <= minYear && yearValue >= maxYear) {
		yearValue = maxYear;
	}

	var sqlArea = $(boroughId).prop("checked") ? "dbpedia:borough" : "dbpedia:city_district";

	var criteriaValue = $(criteriaId).val();

	var sqlCriteria = "";
	var sqlValue = "?value";
	if (criteriaValue == "Between25and55") {
		// We need to calculate this from other data
		sqlValue = "(xsd:integer(?valueTotal)-xsd:integer(?valueYounger)-xsd:integer(?valueOlder) AS ?value)";
		sqlCriteria = "OPTIONAL {?id lodcom:hasYoungerthan25Unemployment" + yearValue + " ?valueYounger. ?id lodcom:hasOlderthan55Unemployment" + yearValue + " ?valueOlder. ?id lodcom:hasUnemployment" + yearValue + " ?valueTotal. }.";
	}
	else {
		sqlCriteria = "OPTIONAL { ?id lodcom:has";
		switch (criteriaValue) {
			case "Male":
			case "Female":
			case "Longtime":
			case "Foreign":
			case "Olderthan55":
			case "Youngerthan25":
				// Can be added as is
				sqlCriteria += criteriaValue;
				break;
			// default: Nothing to add
		}
		sqlCriteria += "Unemployment" + yearValue + " ?value. }.";
	}

	var query = sqlPrefixes + "\
	SELECT DISTINCT ?name " + sqlValue + " ?geo\n\
	WHERE { GRAPH <http://course.introlinkeddata.org/G1> {\n\
	   ?id lodcom:TypeofCityDivision " + sqlArea + ".\n\
	   ?id dc:title ?name.\n\
	   ?id dc:coverage ?coverageId. ?coverageId geo:asWKT ?geo.\n\
	   " + sqlCriteria + "\n\
	}}";

	return query;
}

/**
* Builds the query to retrieve the data for the charts, which is actually the data according to the
* selected criteria and area, but for all years.

 * @param string areaName
 * @param string criteriaValue
 * @returns {string} */
function buildQueryAllYears(areaName, criteriaValue) {
	var sqlArea = $(boroughId).prop("checked") ? "dbpedia:borough" : "dbpedia:city_district";
	var sqlFilter = "";

	switch (criteriaValue) {
		case "Between25and55":
			sqlFilter = 'has(Youngerthan25|Olderthan55|)Unemployment';
			break;
		case "Male":
		case "Female":
		case "Longtime":
		case "Foreign":
		case "Olderthan55":
		case "Youngerthan25":
		case "":
			// Can be added as is
			sqlFilter = "has" + criteriaValue + "Unemployment";
			break;
	}

	var query = sqlPrefixes + "\
	SELECT DISTINCT ?key ?value\n\
	WHERE { GRAPH <http://course.introlinkeddata.org/G1> {\n\
	   ?id lodcom:TypeofCityDivision " + sqlArea + ".\n\
	   ?id dc:title \"" + areaName + "\".\n\
	   ?id ?key ?value.\n\
		FILTER regex(str(?key), \"" + sqlFilter + "\").\n\
	}} ORDER BY ?key";

	return query;
}

/**
* Builds the query to retrieve the additional data.

 * @param string areaName
 * @returns {string} */
function buildQueryMoreData(areaName) {
	var query = sqlPrefixes + "\
	SELECT DISTINCT ?value\n\
	WHERE { GRAPH <http://course.introlinkeddata.org/G1> {\n\
	   ?id dc:title \"" + areaName + "\".\n\
	   ?id rdfs:seeAlso ?value.\n\
	}} ORDER BY ?value";
	return query;
}

/**
* Updates the data on the map.
*
* Removes old layers and adds the boundaries as layers according to the given data received by an AJAX call.
* Colorizes the boundaries according to the legend and adds a popup for additional data and a charts.

 * @param object data
 * @returns void */
function updateData(data) {
	// Remove old data from map
	for (var row in features) {
		if (features.hasOwnProperty(row)) {
			map.removeLayer(features[row]);
		}
	}
	features = [];

	// Work with the data
	var bindings = data.results.bindings;
	var defaultOptions = map.defaults || {};
	var minDataValue = Number.MAX_SAFE_INTEGER;
	var maxDataValue = Number.MIN_SAFE_INTEGER;
	// Get min/max data
	for (var row in bindings) {
		if (bindings[row].value) {
			var value = parseInt(bindings[row].value.value, 10);
			if (value < minDataValue) {
				minDataValue = value;
			}
			if (value > maxDataValue) {
				maxDataValue = value;
			}
		}
	}

	var border1 = Math.floor(minDataValue + (maxDataValue - minDataValue) / 3);
	var border2 = Math.ceil(minDataValue + 2 * ((maxDataValue - minDataValue) / 3));
	updateLegend(minDataValue, border1, border2, maxDataValue);

	// Insert geometries with data
	for (var row in bindings) {
		var value = null;
		// Get the data
		if (bindings[row].value) {
			value = bindings[row].value.value;
		}
		var geo = bindings[row].geo.value;
		// Remove the CRS url from the string. Can't be parsed and Leaflet is in EPSG4326 anyway.
		geo = geo.replace("<http://www.opengis.net/def/crs/EPSG/0/4326>", "")
		// Read WKT and create leaflet object
		wkt.read(geo);
		// Change color according to data
		if (value == null || value < 0) {
			defaultOptions.color = "#000000";
		}
		else if (value <= border1) {
			defaultOptions.color = "#006622";
		}
		else if (value <= border2) {
			defaultOptions.color = "#cc7a00";
		}
		else {
			defaultOptions.color = "#cc0000";
		}
		defaultOptions.weight = 2;
		var obj = wkt.toObject(defaultOptions);
		// Bind popup with additional data
		var popupHtml = '<div id="mapData">\n\
			<ul class="nav nav-tabs">\n\
			<li role="presentation" class="active" id="tab-chart"><a href="javascript:tab(\'chart\')">Chart</a></li>\n\
			<li role="presentation" id="tab-moredata"><a href="javascript:tab(\'moredata\')">See also...</a></li>\n\
			</ul>\n\
			<div id="chart" data-name="' + bindings[row].name.value + '">No chart available so far.</div>\n\
			<div id="moredata"><h4>References for Münster ' + bindings[row].name.value + '</h4><ul id="' + dataListIdn + '"><li>No additional data available so far.</li></ul></div>\n\
			</div>';
		obj.bindPopup(popupHtml, {maxWidth: 450});
		// Add object to map and feature array (for later removal)
		map.addControl(obj);
		features.push(obj);
	}

	updateChart(null);
}

/**
* Changed the visible tab to the one specified (moredata or chart) and hides the other one.

 * @param  string tab
 * @returns void */
function tab(tab) {
	var activeTab = (tab == 'moredata') ? 'moredata' : 'chart';
	var inactiveTab = (tab == 'moredata') ? 'chart' : 'moredata';

	$("#tab-" + activeTab).addClass("active");
	$("#tab-" + inactiveTab).removeClass("active");

	$("#" + activeTab).show();
	$("#" + inactiveTab).hide();
}

/**
* Checks whether the received data is complete and if not completes the data set.
* Transforms the given object received by an AJAX call to a more usable array with the correct data types.

 * @param object data
 * @returns {fillMissingYears.dataSeries|Array} */
function fillMissingYears(data) {
	var dataSeries = [];
	// Set default values (null) for each year
	for (var y = minYear; y <= maxYear; y++) {
		dataSeries.push(null);
	}
	for (var i in data) {
		var key = data[i].key.value;
		var year = parseInt(key.substr(key.length-4, 4), 10);
		dataSeries[year - minYear] =  parseInt(data[i].value.value, 10);
	}
	return dataSeries;
}

/**
* Updates the legend with the specified values.

 * @param int min
 * @param int border1
 * @param int border2
 * @param int max
 * @returns void */
function updateLegend(min, border1, border2, max) {
	if (min == Number.MAX_SAFE_INTEGER || max == Number.MIN_SAFE_INTEGER) {
		$(legend1Id).text("N/A");
		$(legend2Id).text("N/A");
		$(legend3Id).text("N/A");
	}
	else {
		$(legend1Id).text(min + " - " + border1);
		$(legend2Id).text((border1 + 1) + " - " + border2);
		$(legend3Id).text((border2 + 1) + " - " + max);
	}
}

/**
* Builds a list of external links for the current selection using the data received by the AJAX call.

 * @param string areaName
 * @param object data
 * @returns void */
function updateMoreData(areaName, data) {
	var list = $('#' + dataListIdn);
	list.empty();
	if (areaName == null || !Array.isArray(data.results.bindings) || data.results.bindings.length == 0) {
		list.append("<li>No additional data available.</li>");
	}
	else {
		var bindings = data.results.bindings;
		for (var i in bindings) {
			var url = bindings[i].value.value;
			list.append("<li><a href='"+url+"' target='_blank'>"+url+"</a></li>");
		}
	}
}

/**
* Builds the charts using the data received from the AJAX call.

 * @param string areaName
 * @param {type} criteriaValue
 * @param object data
 * @returns void */
function updateChart(areaName, criteriaValue, data) {
	if (areaName == null || !Array.isArray(data.results.bindings)) {
		$(diagramId).text("No data available.");
	}
	else {
		var dataSeries1 = [];
		var bindings = data.results.bindings;

		if (criteriaValue == "Between25and55") {
			var dataSeriesTotal = [], dataSeriesYounger = [], dataSeriesOlder = [];
			// Split result set into totals, younger and older
			for (var i in bindings) {
				var key = bindings[i].key.value;
				if (key.indexOf("hasYoungerthan25Unemployment") > -1) {
					dataSeriesYounger.push(bindings[i]);
				}
				else if (key.indexOf("hasOlderthan55Unemployment") > -1) {
					dataSeriesOlder.push(bindings[i]);
				}
				else { // hasUnemployment
					dataSeriesTotal.push(bindings[i]);
				}
			}
			// Fill each category with null values if needed
			dataSeriesTotal = fillMissingYears(dataSeriesTotal);
			dataSeriesYounger = fillMissingYears(dataSeriesYounger);
			dataSeriesOlder = fillMissingYears(dataSeriesOlder);
			// Calculate data for each year
			for (var i = 0; i < years.length; i++) {
				if (dataSeriesTotal[i] !== null && dataSeriesYounger[i] !== null && dataSeriesOlder[i] !== null) {
					dataSeries1.push(dataSeriesTotal[i] - dataSeriesYounger[i] - dataSeriesOlder[i]);
				}
				else {
					dataSeries1.push(null);
				}
			}
		}
		else {
			dataSeries1 = fillMissingYears(bindings);
		}

		var yearIndex = $(yearSliderId).slider("value") - minYear;
		$(diagramId).highcharts({
			chart: {
				type: 'column'
			},
			title: {
				text: 'Unemployment in Münster ' + areaName,
				style: { fontSize: '16px' }
			},
			subtitle: {
				text: getCurrentCriteriaName(criteriaValue),
				style: { fontSize: '13px' }
			},
			credits: {
				href: "http://www.muenster.de/stadt/stadtplanung/zahlen.html",
				text: "Source: Stadt Münster"
			},
			xAxis: {
				title: {text: 'Year'},
				categories: years,
				plotBands: [{
						color: '#ffddcc',
						from: yearIndex - 0.5,
						to: yearIndex + 0.5,
					}]
			},
			yAxis: {
				title: {text: 'Number of unemployed citizens'},
			},
			legend: {enabled: false},
			series: [{
					name: areaName,
					data: dataSeries1
				}]
		});
	}
}

/**
* Starts the IntroJS tutorial.

	* @returns void */
function startIntro(){
	var intro = introJs();
		intro.setOptions({
			steps: [
				{
					intro: "Welcome! This webpage will help you explore unemployment data in different areas of Münster."
				},
				{
					element: '#settingsBox',
					intro: "Use this sidebar to customize the data that is displayed on the map.",
					position: 'right'
				},
				{
					element: '#yearSection',
					intro: "You can move this slider to get data from 2010 to 2014.",
					position: 'right'
				},
				{
					element: '#criteriaSection',
					intro: "Choose a criterion to select a specific group of unemployed.",
					position: 'right'
				},
				{
					element: '#boundarySection',
					intro: "You can also switch to districts to get finer granularity.",
					position: 'right'
				},
				{
					element: '#legendBox',
					intro: "This legend will tell how many unemployed are represented by each color.",
					position: 'right'
				},
				{
					element: '#map',
					intro: "Check the map to view your selected data! You can also click on all boundaries. A popup will show you a timeline of the information and links to additional information.",
					position: 'left'
				}
			]
		});

		intro.start();
}
