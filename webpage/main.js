// Map config
var cityCenter = [51.960942, 7.625891]; // Coords of the city center of Münster
var zoomLevel = 11; // Initial zoom level of Münster

// HTML config
var yearSliderId = "#year-slider";
var yearValueId = "#year";
var mapIdn = "map";
var diagramId = "#diagram";
var yearActiveId = "#active_year";
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

$(function () {
	// Init map
	map = L.map(mapIdn).setView(cityCenter, zoomLevel);
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);

	// Init year slider
	$(yearSliderId).slider({
		value: maxYear,
		min: minYear,
		max: maxYear,
		step: 1,
		slide: function () {
			$(yearActiveId).prop("checked", true); // When sliding the year bar, then unset the "all years" selection
			updateUI();
		}
	});
	$(yearActiveId).change(updateUI);
	$(districtId).change(updateUI);
	$(boroughId).change(updateUI);
	$(criteriaId).change(updateUI);

	updateUI();
});

function updateUI() {
	updateYearValueUI();
	requestData();
}

function updateYearValueUI() {
	if ($(yearActiveId).prop("checked")) {
		$(yearValueId).text($(yearSliderId).slider("value"));
	}
	else {
		$(yearValueId).text("All");
	}
}

function requestData() {
	var query = buildQuery();
	var url = sparqlUrl + encodeURIComponent(query); // encodeURI is not enough as it doesn't enocde # for example.
	console.log(query);
	console.log(url);
	$.ajax({
	  dataType: "jsonp",
	  url: url,
	  success: updateData
	});
}

function buildQuery() {
	var yearSelected = $(yearActiveId).prop("checked");
	var yearValue = $(yearSliderId).slider("value");
	var boroughSelected = $(boroughId).prop("checked");
	var criteriaValue = $(criteriaId).val();
	
	var sqlArea = boroughSelected ? "dbpedia:borough" : "dbpedia:city_district";

	var sqlCriteria = "?unknown";
	if (criteriaValue == "Between25and55") {
		// We need to calculate this from other data
	}
	else if (yearSelected && yearValue >= minYear && yearValue <= maxYear) {
		sqlCriteria = "lodcom:has";
		switch(criteriaValue) {
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
		sqlCriteria += "Unemployment" + yearValue;
	}
	else { // No valid year
		// Summierung über die Jahre
	}
	
	var query = "\
	prefix dc: <http://purl.org/dc/elements/1.1/>\r\n\
	prefix geo: <http://www.opengis.net/ont/geosparql#>\r\n\
	prefix lodcom: <http://vocab.lodcom.de/>\r\n\
	prefix dbpedia: <http://dbpedia.org/page/classes#>\r\n\
	SELECT DISTINCT ?name ?value ?geo\r\n\
	WHERE { GRAPH <http://course.introlinkeddata.org/G1> {\r\n\
	   ?id lodcom:TypeofCityDivision " + sqlArea + ".\r\n\
	   ?id dc:title ?name.\r\n\
	   ?id dc:coverage ?coverageId.\r\n\
	   ?coverageId geo:asWKT ?geo.\r\n\
	   ?id " + sqlCriteria + " ?value.\r\n\
	}}";
		
	return query;
}

function updateData(data) {
	// Remove old data from map
	for(var row in features){
		console.log(features[row]);
		if (features.hasOwnProperty(row)) {
			map.removeLayer(features[row]);
		}
	}
	features = [];

	// Work with the data
	var bindings = data.results.bindings;
	var defaultOptions = map.defaults || {};
    for(var row in bindings){
		// Get the data
		var name = bindings[row].name.value;
		var value = bindings[row].value.value;
		var geo = bindings[row].geo.value;
		// Remove the CRS url from the string. Can't be parsed and Leaflet is in EPSG4326 anyway.
		geo = geo.replace("<http://www.opengis.net/def/crs/EPSG/0/4326>", "")
		// Read WKT and create leaflet object
		wkt.read(geo);
		// Change color according to data
		if (value < 100) {
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
		obj.bindPopup("<strong>" + name + "</strong><br />" + "Unemployment count: " + value);
		// Add object to map and feature array (for later removal)
		map.addControl(obj);
		features.push(obj);
    }
	
	updateChart();
}

function updateChart() {
	$(diagramId).highcharts({
		title: {
			text: 'Unemployment in Muenster',
			x: -20 //center
		},
		subtitle: {
			text: 'Source: Stadt Muenster',
			x: -20
		},
		xAxis: {
			categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
		},
		yAxis: {
			title: {
				text: 'Number of Persons'
			},
			plotLines: [{
					value: 0,
					width: 1,
					color: '#808080'
				}]
		},
		tooltip: {
			valueSuffix: '# Unit'
		},
		legend: {
			layout: 'vertical',
			align: 'right',
			verticalAlign: 'middle',
			borderWidth: 0
		},
		series: [{
				name: 'Graph One',
				data: [7.0, 6.9, 9.5, 14.5, 18.2, 21.5, 25.2, 26.5, 23.3, 18.3, 13.9, 9.6]
			}, {
				name: 'Graph Two',
				data: [-0.2, 0.8, 5.7, 11.3, 17.0, 22.0, 24.8, 24.1, 20.1, 14.1, 8.6, 2.5]
			}]
	});
}