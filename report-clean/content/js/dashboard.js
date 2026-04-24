/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

/*
 * Add header in statistics table to group metrics by category
 * format
 *
 */
function summaryTableHeader(header) {
    var newRow = header.insertRow(-1);
    newRow.className = "tablesorter-no-sort";
    var cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Requests";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 3;
    cell.innerHTML = "Executions";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 7;
    cell.innerHTML = "Response Times (ms)";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Throughput";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 2;
    cell.innerHTML = "Network (KB/sec)";
    newRow.appendChild(cell);
}

/*
 * Populates the table identified by id parameter with the specified data and
 * format
 *
 */
function createTable(table, info, formatter, defaultSorts, seriesIndex, headerCreator) {
    var tableRef = table[0];

    // Create header and populate it with data.titles array
    var header = tableRef.createTHead();

    // Call callback is available
    if(headerCreator) {
        headerCreator(header);
    }

    var newRow = header.insertRow(-1);
    for (var index = 0; index < info.titles.length; index++) {
        var cell = document.createElement('th');
        cell.innerHTML = info.titles[index];
        newRow.appendChild(cell);
    }

    var tBody;

    // Create overall body if defined
    if(info.overall){
        tBody = document.createElement('tbody');
        tBody.className = "tablesorter-no-sort";
        tableRef.appendChild(tBody);
        var newRow = tBody.insertRow(-1);
        var data = info.overall.data;
        for(var index=0;index < data.length; index++){
            var cell = newRow.insertCell(-1);
            cell.innerHTML = formatter ? formatter(index, data[index]): data[index];
        }
    }

    // Create regular body
    tBody = document.createElement('tbody');
    tableRef.appendChild(tBody);

    var regexp;
    if(seriesFilter) {
        regexp = new RegExp(seriesFilter, 'i');
    }
    // Populate body with data.items array
    for(var index=0; index < info.items.length; index++){
        var item = info.items[index];
        if((!regexp || filtersOnlySampleSeries && !info.supportsControllersDiscrimination || regexp.test(item.data[seriesIndex]))
                &&
                (!showControllersOnly || !info.supportsControllersDiscrimination || item.isController)){
            if(item.data.length > 0) {
                var newRow = tBody.insertRow(-1);
                for(var col=0; col < item.data.length; col++){
                    var cell = newRow.insertCell(-1);
                    cell.innerHTML = formatter ? formatter(col, item.data[col]) : item.data[col];
                }
            }
        }
    }

    // Add support of columns sort
    table.tablesorter({sortList : defaultSorts});
}

$(document).ready(function() {

    // Customize table sorter default options
    $.extend( $.tablesorter.defaults, {
        theme: 'blue',
        cssInfoBlock: "tablesorter-no-sort",
        widthFixed: true,
        widgets: ['zebra']
    });

    var data = {"OkPercent": 99.78540772532189, "KoPercent": 0.2145922746781116};
    var dataset = [
        {
            "label" : "FAIL",
            "data" : data.KoPercent,
            "color" : "#FF6347"
        },
        {
            "label" : "PASS",
            "data" : data.OkPercent,
            "color" : "#9ACD32"
        }];
    $.plot($("#flot-requests-summary"), dataset, {
        series : {
            pie : {
                show : true,
                radius : 1,
                label : {
                    show : true,
                    radius : 3 / 4,
                    formatter : function(label, series) {
                        return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">'
                            + label
                            + '<br/>'
                            + Math.round10(series.percent, -2)
                            + '%</div>';
                    },
                    background : {
                        opacity : 0.5,
                        color : '#000'
                    }
                }
            }
        },
        legend : {
            show : true
        }
    });

    // Creates APDEX table
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.5834763948497854, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.9945054945054945, 500, 1500, "GET /dashboard-1"], "isController": false}, {"data": [0.0, 500, 1500, "POST /api/ai/itinerary-flow/research"], "isController": false}, {"data": [0.572992700729927, 500, 1500, "GET /dashboard"], "isController": false}, {"data": [0.7197802197802198, 500, 1500, "GET /dashboard-0"], "isController": false}, {"data": [0.0, 500, 1500, "POST /api/ai/itinerary-flow/planner"], "isController": false}, {"data": [0.0, 500, 1500, "POST /api/ai/itinerary-flow/logistics"], "isController": false}, {"data": [0.8088235294117647, 500, 1500, "POST /api/ai/itinerary-flow/safety"], "isController": false}, {"data": [1.0, 500, 1500, "POST /api/ai/itinerary-flow/budget"], "isController": false}, {"data": [0.9710144927536232, 500, 1500, "GET /api/health"], "isController": false}, {"data": [0.8025830258302583, 500, 1500, "GET /api/trips"], "isController": false}]}, function(index, item){
        switch(index){
            case 0:
                item = item.toFixed(3);
                break;
            case 1:
            case 2:
                item = formatDuration(item);
                break;
        }
        return item;
    }, [[0, 0]], 3);

    // Create statistics table
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 2330, 5, 0.2145922746781116, 14376.092703862638, 3, 206181, 499.0, 107264.40000000001, 115275.75, 127352.5700000001, 2.6928788955729304, 30.738722982724546, 3.8062489706672675], "isController": false}, "titles": ["Label", "#Samples", "FAIL", "Error %", "Average", "Min", "Max", "Median", "90th pct", "95th pct", "99th pct", "Transactions/s", "Received", "Sent"], "items": [{"data": ["GET /dashboard-1", 273, 0, 0.0, 91.37362637362641, 30, 2499, 49.0, 164.2, 178.0, 561.499999999992, 0.3685573342909524, 8.024608469005408, 0.3928182663022494], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/research", 269, 4, 1.486988847583643, 117252.72490706317, 55735, 206181, 114065.0, 124934.0, 155129.0, 198005.10000000006, 0.31752102248851494, 3.754378086682059, 0.4410420211481985], "isController": false}, {"data": ["GET /dashboard", 274, 1, 0.36496350364963503, 807.2299270072989, 3, 3164, 572.0, 1661.0, 2036.25, 2945.0, 0.36907576155550614, 13.561111230376014, 0.7788427782716748], "isController": false}, {"data": ["GET /dashboard-0", 273, 0, 0.0, 718.4102564102565, 393, 2850, 490.0, 1548.2, 1953.5, 2808.12, 0.3677466023850994, 5.552042069184181, 0.38692638096931536], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/planner", 270, 0, 0.0, 2498.525925925925, 1540, 6898, 2268.0, 3419.8, 3940.499999999999, 5640.560000000014, 0.36661072458572985, 0.9664663843424633, 0.42403287963558894], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/logistics", 149, 0, 0.0, 3714.2080536912754, 1959, 5779, 3698.0, 4966.0, 5207.5, 5715.5, 0.30619374460564713, 1.0557298463123177, 0.5455219967582507], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/safety", 136, 0, 0.0, 441.33823529411757, 25, 1946, 254.5, 1136.6, 1334.2000000000003, 1915.6599999999996, 0.2891162608764049, 0.9841337819064241, 0.6565818990899215], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/budget", 139, 0, 0.0, 63.07913669064748, 22, 254, 40.0, 128.0, 148.0, 221.59999999999954, 0.29001533534327173, 1.356832720223875, 0.6277376391395516], "isController": false}, {"data": ["GET /api/health", 276, 0, 0.0, 167.37681159420276, 35, 2118, 104.0, 279.0000000000001, 537.0499999999967, 1500.0400000000081, 0.37216527374374, 0.6264078925500872, 0.3919478785736631], "isController": false}, {"data": ["GET /api/trips", 271, 0, 0.0, 627.512915129151, 386, 2367, 440.0, 1306.4000000000008, 1745.1999999999985, 2263.3599999999988, 0.3672051891106724, 0.6493232152608309, 0.3863525134246694], "isController": false}]}, function(index, item){
        switch(index){
            // Errors pct
            case 3:
                item = item.toFixed(2) + '%';
                break;
            // Mean
            case 4:
            // Mean
            case 7:
            // Median
            case 8:
            // Percentile 1
            case 9:
            // Percentile 2
            case 10:
            // Percentile 3
            case 11:
            // Throughput
            case 12:
            // Kbytes/s
            case 13:
            // Sent Kbytes/s
                item = item.toFixed(2);
                break;
        }
        return item;
    }, [[0, 0]], 0, summaryTableHeader);

    // Create error table
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["502/Bad Gateway", 1, 20.0, 0.04291845493562232], "isController": false}, {"data": ["Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: voyageai-nextjs-staging-clhvq.ondigitalocean.app:443 failed to respond", 1, 20.0, 0.04291845493562232], "isController": false}, {"data": ["Non HTTP response code: java.net.SocketTimeoutException/Non HTTP response message: Read timed out", 3, 60.0, 0.12875536480686695], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 2330, 5, "Non HTTP response code: java.net.SocketTimeoutException/Non HTTP response message: Read timed out", 3, "502/Bad Gateway", 1, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: voyageai-nextjs-staging-clhvq.ondigitalocean.app:443 failed to respond", 1, "", "", "", ""], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": [], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/research", 269, 4, "Non HTTP response code: java.net.SocketTimeoutException/Non HTTP response message: Read timed out", 3, "502/Bad Gateway", 1, "", "", "", "", "", ""], "isController": false}, {"data": ["GET /dashboard", 274, 1, "Non HTTP response code: org.apache.http.NoHttpResponseException/Non HTTP response message: voyageai-nextjs-staging-clhvq.ondigitalocean.app:443 failed to respond", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
