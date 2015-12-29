// Map config
var cityCenter = [51.960942, 7.625891]; // Coords of the city center of Münster
var zoomLevel = 11; // Initial zoom level of Münster

// HTML config
var yearSliderId = "#year-slider";
var yearValueId = "#year";
var mapIdn = "map";
var diagramId = "#diagram";
var criteriaId = "#criteria";
var districtId = "#bound_districts";
var boroughId = "#bound_boroughs";

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
prefix xsd: <http://www.w3.org/2001/XMLSchema#>\n";

// Precalculating data
var years = [];
for (var y = minYear; y <= maxYear; y++) {
	years.push(y);
}

// Initializing webpage (onload)
$(function () {
	// Init map
	map = L.map(mapIdn).setView(cityCenter, zoomLevel);
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);
	// When the popup opens load the chart
	map.on('popupopen', function () {
		requestChartData($('#diagram').data('name'));
	});

	// Init year slider
	$(yearSliderId).slider({
		value: maxYear,
		min: minYear,
		max: maxYear,
		step: 1,
		slide: function (event, ui) {
			$(yearValueId).text(ui.value);
			requestMapData();
		}
	});
	$(districtId).change(requestMapData);
	$(boroughId).change(requestMapData);
	$(criteriaId).change(requestMapData);

	$(yearValueId).text($(yearSliderId).slider("value"));
	requestMapData();
});

function askTripleStore(query, callbackSuccess) {
	var url = sparqlUrl + encodeURIComponent(query); // encodeURI is not enough as it doesn't enocde # for example.
	console.log(query, url);
	$.ajax({
		dataType: "jsonp",
		url: url,
		success: callbackSuccess
	});
}

function requestMapData() {
	askTripleStore(buildQuerySingleYear(), updateData);
}

function requestChartData(areaName) {
	askTripleStore(buildQueryAllYears(areaName), function (data) {
		updateChart(areaName, data);
	});
}

function getCurrentCriteriaName() {
	var criteriaValue = $(criteriaId).val();
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

function buildQuerySingleYear() {
	var yearValue = $(yearSliderId).slider("value");
	if (yearValue >= minYear && yearValue <= maxYear) {
		yearValue = maxYear;
	}

	var sqlArea = $(boroughId).prop("checked") ? "dbpedia:borough" : "dbpedia:city_district";

	var criteriaValue = $(criteriaId).val();

	var sqlCriteria = "";
	var sqlValue = "?value";
	if (criteriaValue == "Between25and55") {
		// We need to calculate this from other data
		sqlValue = "(xsd:integer(?valueTotal)-xsd:integer(?valueYounger)-xsd:integer(?valueOlder) AS ?value)";
		sqlCriteria = "?id lodcom:hasYoungerthan25Unemployment" + yearValue + " ?valueYounger. ?id lodcom:hasOlderthan55Unemployment" + yearValue + " ?valueOlder. ?id lodcom:hasUnemployment" + yearValue + " ?valueTotal.";
	}
	else {
		sqlCriteria = "?id lodcom:has";
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
		sqlCriteria += "Unemployment" + yearValue + " ?value.";
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

function buildQueryAllYears(areaName) {
	var sqlArea = $(boroughId).prop("checked") ? "dbpedia:borough" : "dbpedia:city_district";

	var criteriaValue = $(criteriaId).val();
	var sqlCriteria = [];
	var sqlValue = [];

	for (var ix in years) {
		var year = years[ix];
		if (criteriaValue == "Between25and55") {
			// We need to calculate this from other data
			sqlValue.push("(xsd:integer(?" + year + "Total)-xsd:integer(?" + year + "Younger)-xsd:integer(?" + year + "Older) AS ?" + year + ")");
			sqlCriteria.push("?id lodcom:hasYoungerthan25Unemployment" + year + " ?" + year + "Younger. ?id lodcom:hasOlderthan55Unemployment" + year + " ?" + year + "Older. ?id lodcom:hasUnemployment" + year + " ?" + year + "Total.");
		}
		else {
			var sqlTemp = "?id lodcom:has";
			switch (criteriaValue) {
				case "Male":
				case "Female":
				case "Longtime":
				case "Foreign":
				case "Olderthan55":
				case "Youngerthan25":
					// Can be added as is
					sqlTemp += criteriaValue;
					break;
					// default: Nothing to add
			}
			sqlTemp += "Unemployment" + year + " ?" + year + ".";
			sqlCriteria.push(sqlTemp);
			sqlValue.push("?" + year);
		}
	}

	var query = sqlPrefixes + "\
	SELECT DISTINCT " + sqlValue.join(" ") + "\n\
	WHERE { GRAPH <http://course.introlinkeddata.org/G1> {\n\
	   ?id lodcom:TypeofCityDivision " + sqlArea + ".\n\
	   ?id dc:title \"" + areaName + "\".\n\
	   " + sqlCriteria.join(" ") + "\n\
	}}";

	return query;
}

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
	for (var row in bindings) {
		var value = null;
		// Get the data
		var name = bindings[row].name.value;
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
		else if (value < 100) {
			defaultOptions.color = "#006622";
		}
		else if (value < 1000) {
			defaultOptions.color = "#cc7a00";
		}
		else {
			defaultOptions.color = "#cc0000";
		}
		var obj = wkt.toObject(defaultOptions);
		// Bind popup with additional data
		obj.bindPopup(
				"<div id='diagram' data-name=\"" + name + "\">No chart available so far.</div>",
				{maxWidth: 450}
		);
		// Add object to map and feature array (for later removal)
		map.addControl(obj);
		features.push(obj);
	}

	updateChart(null);
}

function updateChart(areaName, data) {
	if (areaName == null || !Array.isArray(data.results.bindings)) {
		$(diagramId).text("No data available.");
	}
	else {
		var dataSeries1 = [];
		var bindings = data.results.bindings.shift();
		for (var key in bindings) {
			if (bindings[key].value) {
				// We hope that the values are in ascending order, like the query has been created.
				// Not very elegant, but I dont see a better solution so far and it should work theoretically.
				dataSeries1.push(parseInt(bindings[key].value, 10));
			}
		}
		var yearIndex = $(yearSliderId).slider("value") - minYear;
		$(diagramId).highcharts({
			title: {
				text: 'Unemployment in Münster ' + areaName,
				style: { fontSize: '16px' }
			},
			subtitle: {
				text: getCurrentCriteriaName(),
				style: { fontSize: '13px' }
			},
			credits: {
				href: "http://www.muenster.de/stadt/stadtplanung/zahlen.html",
				text: "Source: Stadt Muenster"
			},
			xAxis: {
				title: {text: 'Year'},
				categories: years,
				plotBands: [{
						color: '#FCFCE5',
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