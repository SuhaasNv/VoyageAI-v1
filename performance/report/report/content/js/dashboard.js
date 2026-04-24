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

    var data = {"OkPercent": 77.63684612962713, "KoPercent": 22.36315387037287};
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
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.7402509782755363, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.0, 500, 1500, "POST /api/auth/login (dummy)"], "isController": false}, {"data": [0.9981501057082452, 500, 1500, "GET /dashboard-1"], "isController": false}, {"data": [0.9748942917547568, 500, 1500, "GET /dashboard"], "isController": false}, {"data": [0.9952431289640592, 500, 1500, "GET /dashboard-0"], "isController": false}, {"data": [0.0, 500, 1500, "POST /api/ai/itinerary-flow/planner"], "isController": false}, {"data": [0.99359316604378, 500, 1500, "GET /dashboard/destination/Petra-0"], "isController": false}, {"data": [0.99679658302189, 500, 1500, "GET /dashboard/destination/Petra-1"], "isController": false}, {"data": [0.9706353443673251, 500, 1500, "GET /dashboard/destination/Petra"], "isController": false}, {"data": [0.0, 500, 1500, "GET /api/admin/system-health"], "isController": false}, {"data": [0.9992117708880714, 500, 1500, "GET /api/health"], "isController": false}, {"data": [0.9997294372294372, 500, 1500, "GET /api/auth/csrf"], "isController": false}, {"data": [0.8584905660377359, 500, 1500, "GET /api/trips"], "isController": false}]}, function(index, item){
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
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 22233, 4972, 22.36315387037287, 445.93163315791753, 16, 7495, 125.0, 604.0, 2408.9000000000015, 5531.0, 29.574952344592823, 395.8848982762411, 9.109930567518367], "isController": false}, "titles": ["Label", "#Samples", "FAIL", "Error %", "Average", "Min", "Max", "Median", "90th pct", "95th pct", "99th pct", "Transactions/s", "Received", "Sent"], "items": [{"data": ["POST /api/auth/login (dummy)", 1840, 1840, 100.0, 3020.7809782608697, 45, 7363, 2889.0, 5619.8, 5866.749999999999, 6090.0, 2.473483982846926, 4.04757975179462, 1.241573014827461], "isController": false}, {"data": ["GET /dashboard-1", 1892, 0, 0.0, 91.19873150105708, 24, 542, 57.0, 180.0, 238.0, 428.0, 2.535078410564792, 55.207645591147596, 0.42828961428487206], "isController": false}, {"data": ["GET /dashboard", 1892, 0, 0.0, 208.5919661733617, 54, 1087, 163.0, 407.0, 502.0, 733.1399999999999, 2.5349051889187666, 92.84118254181186, 0.8218637917197563], "isController": false}, {"data": ["GET /dashboard-0", 1892, 0, 0.0, 117.22251585623684, 29, 883, 83.0, 243.0, 307.3499999999999, 493.119999999999, 2.535272039245797, 37.64275613768323, 0.3936604045313298], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/planner", 1771, 1358, 76.6798418972332, 813.447204968943, 255, 7495, 369.0, 2254.9999999999995, 2532.2, 3240.56, 2.4297952441319963, 5.895234330839054, 2.0901083405191336], "isController": false}, {"data": ["GET /dashboard/destination/Petra-0", 1873, 0, 0.0, 125.16657768286159, 29, 1762, 95.0, 244.0, 324.0, 550.78, 2.515843230595233, 37.91454893301651, 0.4643499712719717], "isController": false}, {"data": ["GET /dashboard/destination/Petra-1", 1873, 0, 0.0, 93.8142018152696, 24, 1220, 57.0, 182.60000000000014, 270.5999999999999, 447.29999999999995, 2.515998688940352, 55.12275767745649, 0.5184333236000139], "isController": false}, {"data": ["GET /dashboard/destination/Petra", 1873, 0, 0.0, 219.1639081687134, 54, 2982, 172.0, 431.0, 529.3, 776.26, 2.515660760527362, 93.02715309014609, 0.9826799845810008], "isController": false}, {"data": ["GET /api/admin/system-health", 1774, 1774, 100.0, 64.9165727170237, 16, 3783, 36.0, 137.0, 166.5, 250.75, 2.435779318942921, 4.371120454625029, 0.411513498219849], "isController": false}, {"data": ["GET /api/health", 1903, 0, 0.0, 110.60798738833427, 32, 792, 81.0, 225.60000000000014, 276.0, 379.8000000000002, 2.543998609690723, 4.282245524942015, 0.39749978276417547], "isController": false}, {"data": ["GET /api/auth/csrf", 1848, 0, 0.0, 60.90151515151515, 16, 511, 34.0, 131.0, 162.0, 253.03999999999996, 2.4908681646021753, 4.869028398828699, 0.3964956160450729], "isController": false}, {"data": ["GET /api/trips", 1802, 0, 0.0, 481.5299667036624, 373, 1758, 448.0, 573.7, 624.0, 1581.94, 2.45182744141874, 4.335384378290986, 1.1157730348643875], "isController": false}]}, function(index, item){
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
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["500/Internal Server Error", 1840, 37.00724054706355, 8.275986146718841], "isController": false}, {"data": ["401/Unauthorized", 1774, 35.67980691874497, 7.979130121890883], "isController": false}, {"data": ["429/Too Many Requests", 1358, 27.31295253419147, 6.108037601763145], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 22233, 4972, "500/Internal Server Error", 1840, "401/Unauthorized", 1774, "429/Too Many Requests", 1358, "", "", "", ""], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": ["POST /api/auth/login (dummy)", 1840, 1840, "500/Internal Server Error", 1840, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["POST /api/ai/itinerary-flow/planner", 1771, 1358, "429/Too Many Requests", 1358, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["GET /api/admin/system-health", 1774, 1774, "401/Unauthorized", 1774, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
