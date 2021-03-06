var osenv = require('osenv');
var home = osenv.home();

var winston = require('winston');

var mkdirp = require('mkdirp');

mkdirp(home + '/Yupana/logs', function (err) {
    if (err) console.error(err);
});

winston.loggers.add('login', {
	console: {
		level: 'error',
		colorize: true,
		label: 'login.js'
	},
	file: {
		level: 'debug',
		filename: home + '/Yupana/logs/yupana.log',
		label: 'login.js',
		handleExceptions: true,
    humanReadableUnhandledException: true
	}
});
winston.loggers.add('db', {
	console: {
		level: 'error',
		colorize: true,
		label: 'db.js'
	},
	file: {
		level: 'debug',
		filename: home + '/Yupana/logs/yupana.log',
		label: 'db.js',
		handleExceptions: true,
    humanReadableUnhandledException: true
	}
});

var appRoot = require('app-root-path');
var noAPI = require(appRoot + '/js/bin/noAPIFunctions.js');
var async = require('async');

var workgroup_session_id = "", xsrf_token = "", currentSiteLuid = "", apiLevel = 0, siteCount = 0, userCount = 0, groupCount = 0, viewCount = 0, workbookCount = 0, projectCount = 0, dataPubCount = 0, dataEmbedCount = 0, taskCount = 0, subscriptionCount = 0, sitesList = [], currentSiteId = "", currentSiteName = "", currentSiteUrl = "";

var gui = require('nw.gui');
var switches = gui.App.argv;
if (process.platform === "darwin") {
  var mb = new gui.Menu({type: 'menubar'});
  mb.createMacBuiltin('Yupana', {
    hideEdit: false,
  });
  gui.Window.get().menu = mb;
}
if (switches.length > 0) {
  for (i=0;i<switches.length;i++) {
    switch(switches[i]) {
      case '--debug':
        gui.Window.get().showDevTools();
        break;
    }
  }
}

function initialiseYupana() {
	checkAPIAccess();
	document.body.className = "yay-hide";
	loadNavBar();
	initiliseStatsTiles();
	curCurrentSite = 0;
	$(".ajax-loading").hide();
	document.getElementById("loadingMsg").hidden = true;

	var portfinder = require('portfinder');
	portfinder.basePort = 8000;
	portfinder.getPort(function (err, port) {
		if (port == 8000){
			startWebServer(port);
		}
	});
	tableauDB.fetchIndexRecords(1,"servers","currentServer", function(currentServer) {
		if (currentServer.length > 0) {
			var cs = currentServer[0];
			console.log(cs);
			if (serverURL == cs.serverUrl) {
				getServerInfo_noAPI(function(server) {
					if (server.user.id == cs.user.id) {
							tableauDB.updateCurrentServer(serverURL, server, 1, function(newServer) {
								console.log("Current Server Updated");
							});
						tableauDB.fetchRecords(0,"projects", function(projects) {
							if(projects.length == 0) {
								console.log("No projects found. ReIndex");
								reIndexServer();
							} else {
								var tableArr = [
									{'name' : 'sites', 'div' : 'site', 'label' : 'sites'},
									{'name' : 'serverUsers', 'div' : 'user', 'label' : 'server users'},
									{'name' : 'groups', 'div' : 'group', 'label' : 'groups'},
									{'name' : 'projects', 'div' : 'project', 'label' : 'projects'},
									{'name' : 'workbooks', 'div' : 'workbook', 'label' : 'workbooks'},
									{'name' : 'views', 'div' : 'view', 'label' : 'views'},
									{'name' : 'pubdatasources', 'div' : 'pubdatasource', 'label' : 'published data sources'},
									{'name' : 'embeddatasources', 'div' : 'embeddatasource', 'label' : 'workbook data sources'},
									{'name' : 'tasks', 'div' : 'task', 'label' : 'tasks'},
									{'name' : 'subscriptions', 'div' : 'subscription', 'label' : 'subscriptions'}
								];
								refreshCount(tableArr);
								console.log("Projects found. Refresh Count");
								loadFinalGui();
							}
						});
					} else {
						console.log("User has changed");
						reIndexServer();
					}
				});
			} else {
				console.log("Server has changed");
				reIndexServer();
			}
		} else {
			console.log("No previous server found");
			reIndexServer();
		}
	});
}

function checkAPIAccess() {
	$('.ajax-loading').show();
	//console.log("Check API Access");

	var settings = {
	  "async": true,
	  "crossDomain": true,
	  "url": serverURL+"/api/2.1/sites/"+currentSiteLuid+"/projects",
	  "method": "GET",
	  "headers": {
	    "X-Tableau-Auth": workgroup_session_id
	  }
	}

	$.ajax(settings).done(function (response, textStatus, jqXHR) {
	  //console.log(response);
		if (jqXHR.status == "404") {
			apiLevel = 0;
			//console.log("API Not Enabled");
		} else {
			//console.log("REST API Available");
			apiLevel = 1;
		}
	});
}

function reIndexServer() {
	//deleteDB('tableau');
	$('#reIndex').hide();
	$(".ajax-loading").show();
	document.getElementById("loadingMsg").hidden = false;
	document.body.className = 'yay-hide';
	var i = 0;
	tableauDB.clearData(["projects","taskSchedules","sitestats","subscriptions","pubdatasources","tasks","embeddatasources","groups","siteUsers","serverUsers","views","subscriptionSchedules","sites","workbooks","viewThumbnails"], function(){
		if (i == 0) {
			tableauDB.fetchIndexRecords(1,"servers","currentServer", function(currentServer) {
				if (currentServer.length > 0) {
					var cs = currentServer[0];
					tableauDB.updateCurrentServer(cs.serverUrl, cs, 0, function(prevServer) {
						console.log("Previous Server Updated");
						getServerInfo_noAPI(function(server) {
							tableauDB.updateCurrentServer(serverURL, server, 1, function(newServer) {
								console.log("Current Server Updated");
							})
						});
					});
				} else {
					getServerInfo_noAPI(function(server) {
						tableauDB.updateCurrentServer(serverURL, server, 1, function(newServer) {
							console.log("Current Server Updated");
						})
					});
				}
			});
			$('.carousel').slick('unslick');
			$('.carousel').remove();
			$('#guiContainer').remove();
			getServerUsers_noAPI();
			getSites_noAPI();
			i = i + 1;
		}
	});
}

function getServerInfo_noAPI(callback){
	var settings = {
		"async": false,
		"crossDomain": true,
		"url": serverURL+"/vizportal/api/web/v1/getSessionInfo",
		"method": "POST",
		"headers": {
			"x-xsrf-token": xsrf_token,
			"accept": "application/json, text/plain, */*",
			"content-type": "application/json;charset=UTF-8"
		},
		"data": "{\"method\":\"getSessionInfo\",\"params\":{}}"
	}
	$.ajax(settings).done(function (response) {
		tableauDB.createServer(serverURL,response.result, function(server) {
			callback(server);
		});
	});
}

function submitSites(sites) {
  for (var i = 0; i < sites.length; i++){
    siteCount = sites.length;
    currentSite = 0;
    tableauDB.createSite(i, sites[i].name, sites[i].urlName, function() {
      currentSite++;
      if (currentSite == siteCount) {
        tableauDB.fetchRecords(0,"sites", function(sites) {
          sitesList = sites;
          document.getElementById("item site").innerHTML = "<div class='countValue'><h2>"+siteCount+"</h2></div><div class='countTitle'>sites</div>";
          $("#loadingMsg").html("Reading " + sitesList[0].name);
          switchSiteLogin(sitesList[0].urlName);
        });
      }
    });
  }
}

function getSites_noAPI(){
	//console.log("Getting Site List");
	document.getElementById("loadingMsg").innerHTML = "Getting List of Sites";
	fullURL = serverURL;
	var settings = {
	  "async": true,
	  "crossDomain": true,
	  "url": serverURL+"/vizportal/api/web/v1/getSiteNamesAcrossAllPods",
	  "method": "POST",
		"headers" : {
			"X-XSRF-TOKEN" : xsrf_token,
			"accept": "application/json, text/plain, */*",
			"content-type": "application/json;charset=UTF-8"
		},
	  "data": "{\"method\":\"getSiteNamesAcrossAllPods\",\"params\":{\"page\":{\"startIndex\":0,\"maxItems\":99999}}}"
	}

	$.ajax(settings).done(function (response) {
		var sites = response.result.siteNames;
		if (sites) {
      if (sites.length == 1) {
        submitSites(sites);
      } else {
        $('.ajax-loading').css('background-image','url("")');
        $('#loadingMsg').html('');
        var allSites = [];
        var newSiteList = [];
        for (var i=0; i < sites.length; i++) {
          var site = {};
          site.name = sites[i].name;
          site.id = i;
          newSiteList.push(site);
          allSites.push(i);
        }
        var div_selectSites = document.createElement("div");
      	div_selectSites.setAttribute('id','selectSites');
        document.body.appendChild(div_selectSites);
        $('#selectSites').html('<h3>Index all sites?</h3>');
        var allBtn = document.createElement("button");
  			allBtn.setAttribute('class','siteBtn');
  			allBtn.innerHTML = "All";
        div_selectSites.appendChild(allBtn);
        var noneBtn = document.createElement("button");
  			noneBtn.setAttribute('class','siteBtn');
        noneBtn.setAttribute('style','left:90px');
  			noneBtn.innerHTML = "None";
        div_selectSites.appendChild(noneBtn);
      	var selectedSites = document.createElement("div");
      	selectedSites.setAttribute('id','selectedSites');
      	div_selectSites.appendChild(selectedSites);
        var ms = $('#selectedSites').magicSuggest({
    			allowFreeEntries : false,
          hideTrigger: true,
    			value: allSites,
    			data: newSiteList,
          displayField: 'name',
          valueField: 'id',
    			toggleOnClick: true
    		});
        allBtn.addEventListener('click', function() {
          ms.setValue(allSites);
        });
        noneBtn.addEventListener('click', function() {
          ms.clear()
        });
        var submitBtn = document.createElement("button");
  			submitBtn.setAttribute('id','submit');
  			submitBtn.innerHTML = "Submit";
        div_selectSites.appendChild(submitBtn);
  			submitBtn.addEventListener('click', function(){
          var idList = ms.getValue();
          var submitedSites = [];
          for (var i = 0; i < idList.length; i++) {
            submitedSites.push(sites[idList[i]]);
          }
          $('.ajax-loading').css('background-image','');
          $('#selectSites').remove();
  				submitSites(submitedSites);
  			}, false);
        $('.ajax-loading').css('background-image','');
      }
		} else {
			getServerElements_noAPI();
		}
	});
}

function switchSite() {
	if (curCurrentSite < siteCount - 1){
			curCurrentSite++;
			$("#loadingMsg").html("Reading " + sitesList[curCurrentSite].name);
			switchSiteLogin(sitesList[curCurrentSite].urlName);
	} else {
		getServerUsers_noAPI();
		var tableArr = [
			{'name' : 'sites', 'div' : 'site', 'label' : 'sites'},
			{'name' : 'serverUsers', 'div' : 'user', 'label' : 'server users'},
			{'name' : 'groups', 'div' : 'group', 'label' : 'groups'},
			{'name' : 'projects', 'div' : 'project', 'label' : 'projects'},
			{'name' : 'workbooks', 'div' : 'workbook', 'label' : 'workbooks'},
			{'name' : 'views', 'div' : 'view', 'label' : 'views'},
			{'name' : 'pubdatasources', 'div' : 'pubdatasource', 'label' : 'published data sources'},
			{'name' : 'embeddatasources', 'div' : 'embeddatasource', 'label' : 'workbook data sources'},
			{'name' : 'tasks', 'div' : 'task', 'label' : 'tasks'},
			{'name' : 'subscriptions', 'div' : 'subscription', 'label' : 'subscriptions'}
		];
		refreshCount(tableArr);
		loadFinalGui();
		$('.ajax-loading').hide();
	}
}

function updateSiteInfo(site) {
	tableauDB.updateSite(curCurrentSite, site, function(site){
		currentSiteLuid = site.luid;
		currentSiteId = site.id;
		currentSiteName = site.name;
		getServerElements_noAPI();
	});
}

function getServerElements_noAPI() {
	var fs=require('fs');
	var __dirname=fs.realpathSync('.');
	var childProcess = require("child_process");
	var retriever = childProcess.fork(__dirname + "/js/bin/retriever.js");
	var data = {
		"serverURL":serverURL,
		"workgroup": workgroup_session_id,
		"token": xsrf_token,
		"site": currentSiteId,
		"siteName": currentSiteName,
		"siteLuid": currentSiteLuid,
		"siteUrl": currentSiteUrl
	};
	retriever.send(data);
	retriever.on('message', function(msg){
		console.log(msg);
		var data = msg.data;
    //console.log(msg);
		switch (msg.type) {
			case "site users":
				if (data[0] != null) {
					async.each(msg.data, function(user, callback) {
						tableauDB.createSiteUser(currentSiteId, user, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Site Users');
					});
				} else {
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Site Users');
				}
				break;
			case "groups":
				if (data[0] != null) {
					async.each(msg.data, function(group, callback) {
						tableauDB.createGroup(group, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'groups', 'div' : 'group', 'label' : 'groups'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Groups');
					});
				} else {
					refreshCount([{'name' : 'groups', 'div' : 'group', 'label' : 'groups'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Groups');
				}
				break;
			case "subscriptions":
				if (data[0] != null) {
					async.each(msg.data, function(subscription, callback) {
						tableauDB.createSubscription(subscription, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'subscriptions', 'div' : 'subscription', 'label' : 'subscriptions'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Subscriptions');
					});
				} else {
					refreshCount([{'name' : 'subscriptions', 'div' : 'subscription', 'label' : 'subscriptions'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Subscriptions');
				}
				break;
			case "subscription schedules":
				if (data[0] != null) {
					async.each(msg.data, function(schedule, callback) {
						tableauDB.createSubscriptionSchedule(schedule, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						//$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Subsciption Schedules');
					});
				}
				break;
			case "projects":
				if (data[0] != null) {
					async.each(msg.data, function(project, callback) {
						tableauDB.createProject(project, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'projects', 'div' : 'project', 'label' : 'projects'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Projects');
					});
				} else {
					refreshCount([{'name' : 'projects', 'div' : 'project', 'label' : 'projects'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Projects');
				}
				break;
			case "embedded data sources":
				if (data[0] != null) {
					async.each(msg.data, function(ds, callback) {
						tableauDB.createEmbedDataSource(ds, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'embeddatasources', 'div' : 'embeddatasource', 'label' : 'workbook data sources'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Workbook Data Sources');
					});
				} else {
					refreshCount([{'name' : 'embeddatasources', 'div' : 'embeddatasource', 'label' : 'workbook data sources'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Workbook Data Sources');
				}
				break;
			case "tasks":
				if (data[0] != null) {
					async.each(msg.data, function(task, callback) {
						tableauDB.createTask(task, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'tasks', 'div' : 'task', 'label' : 'tasks'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Tasks');
					});
				} else {
					refreshCount([{'name' : 'tasks', 'div' : 'task', 'label' : 'tasks'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Tasks');
				}
				break;
			case "task schedules":
				if (data[0] != null) {
					async.each(msg.data, function(schedule, callback) {
						tableauDB.createTaskSchedule(schedule, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						//$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Task Schedules');
					});
				}
				break;
			case "workbooks":
				if (data[0] != null) {
					async.each(msg.data, function(workbook, callback) {
						tableauDB.createWorkbook(workbook, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'workbooks', 'div' : 'workbook', 'label' : 'workbooks'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Workbooks');
					});
				} else {
					refreshCount([{'name' : 'workbooks', 'div' : 'workbook', 'label' : 'workbooks'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Workbooks');
				}
				break;
			case "published data sources":
				if (data[0] != null) {
					async.each(msg.data, function(ds, callback) {
						tableauDB.createPubDataSource(ds, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'pubdatasources', 'div' : 'pubdatasource', 'label' : 'published data sources'}]);
						$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Published Data Sources');
					});
				} else {
					refreshCount([{'name' : 'pubdatasources', 'div' : 'pubdatasource', 'label' : 'published data sources'}]);
					$("#loadingMsg").append('<br/><i class="fa fa-check"></i> Published Data Sources');
				}
				break;
			case "views":
				if (data[0] != null) {
					async.each(msg.data, function(view, callback) {
						if (view.image) {
							var v = view;
              v.siteUrl = currentSiteUrl;
              v.id = parseInt(v.id);
							tableauDB.storeViewThumbnail(v, function (viewImg) {
								//console.log(viewImg);
							});
							view.image = true;
						}
						tableauDB.createView(view, currentSiteId, function() {
							callback();
						});
					}, function(err) {
						if (err) throw err;
						refreshCount([{'name' : 'views', 'div' : 'view', 'label' : 'views'}]);
					});
				} else {
					refreshCount([{'name' : 'views', 'div' : 'view', 'label' : 'views'}]);
				}
				break;
		}
		var status = msg.status;
		if (status.siteUsers && status.groups && status.views && status.workbooks && status.publishedDataSources && status.embeddedDataSources && status.projects && status.tasks && status.taskSchedules && status.subscriptionSchedules && status.subscriptions) {
			console.log("All site's data received");
			switchSite();
		}
	});
}

function refreshCount(tableArr) {
	if (tableArr.length > 0) {
		for (var i=0; i < tableArr.length;i++) {
			tableauDB.numberofRecords(tableArr[i].name, tableArr[i], function(recordCount, table) {
				//console.log(table);
				document.getElementById("item "+table.div).innerHTML = "<div class='countValue'><h2>"+recordCount+"</h2></div><div class='countTitle'>"+table.label+"</div>"
			});
		}
	}
}

function getServerUsers_noAPI() {
	noAPI.getServerUsers(serverURL, workgroup_session_id, xsrf_token, [], 0, 100, function (serverUsers) {
		async.each(serverUsers, function(user, callback) {
			if(user) {
				tableauDB.createServerUser(user, function() {
					callback();
				});
			}
		}, function (err) {
			if (err) throw err;
			refreshCount([{'name' : 'serverUsers', 'div' : 'user', 'label' : 'server users'}]);
		});
	});
}

function createSnapshot (viewId, filePath) {
  var iso = new Isotope( document.getElementById('guiContainer' ) );
  iso.destroy();
  $('#snapshots').remove();
  $('#favorites').remove();
  $('#trending').remove();
  $('#guiContainer').remove();
  tableauDB.fetchRecords(viewId,"views", function(view) {
    tableauDB.saveSnapshot(view[0], filePath, function () {
      loadFinalGui();
    });
  });
}

function removeSnapshot (viewId, callback) {
  var iso = new Isotope( document.getElementById('guiContainer' ) );
  iso.destroy();
  $('#snapshots').remove();
  $('#favorites').remove();
  $('#trending').remove();
  $('#guiContainer').remove();
  tableauDB.deleteSnapshot(viewId, function() {
    loadFinalGui();
  });
}

function initiliseStatsTiles() {
		var newlinetag = document.createElement("br");
		var contentWrapper = document.createElement('div');
		contentWrapper.setAttribute('class','content-wrap');
		var statsContainer = document.createElement("div");
		statsContainer.setAttribute('id','statsContainer');
		var siteCountDiv = document.createElement("div");
		siteCountDiv.setAttribute('class','item');
		siteCountDiv.setAttribute('id','item site');
		siteCountDiv.innerHTML = "<div class='countValue'><h2>"+siteCount+"</h2></div><div class='countTitle'>sites</div>";
		statsContainer.appendChild(siteCountDiv);
		var userCountDiv = document.createElement("div");
		userCountDiv.setAttribute('class','item');
		userCountDiv.setAttribute('id','item user');
		userCountDiv.innerHTML = "<div class='countValue'><h2>"+userCount+"</h2></div><div class='countTitle'>server users</div>";
		statsContainer.appendChild(userCountDiv);
		var groupCountDiv = document.createElement("div");
		groupCountDiv.setAttribute('class','item');
		groupCountDiv.setAttribute('id','item group');
		groupCountDiv.innerHTML = "<div class='countValue'><h2>"+groupCount+"</h2></div><div class='countTitle'>groups</div>";
		statsContainer.appendChild(groupCountDiv);
		var projectCountDiv = document.createElement("div");
		projectCountDiv.setAttribute('class','item');
		projectCountDiv.setAttribute('id','item project');
		projectCountDiv.innerHTML = "<div class='countValue'><h2>"+projectCount+"</h2></div><div class='countTitle'>projects</div>";
		statsContainer.appendChild(projectCountDiv);
		var workbookCountDiv = document.createElement("div");
		workbookCountDiv.setAttribute('class','item');
		workbookCountDiv.setAttribute('id','item workbook');
		workbookCountDiv.innerHTML = "<div class='countValue'><h2>"+workbookCount+"</h2></div><div class='countTitle'>workbooks</div>";
		workbookCountDiv.appendChild(newlinetag);
		statsContainer.appendChild(workbookCountDiv);
		var viewCountDiv = document.createElement("div");
		viewCountDiv.setAttribute('class','item');
		viewCountDiv.setAttribute('id','item view');
		viewCountDiv.innerHTML = "<div class='countValue'><h2>"+viewCount+"</h2></div><div class='countTitle'>views</div>";
		statsContainer.appendChild(viewCountDiv);
		var dataCountDiv = document.createElement("div");
		dataCountDiv.setAttribute('class','item');
		dataCountDiv.setAttribute('id','item pubdatasource');
		dataCountDiv.innerHTML = "<div class='countValue'><h2>"+dataPubCount+"</h2></div><div class='countTitle'>published data sources</div>";
		statsContainer.appendChild(dataCountDiv);
		var dataCountDiv = document.createElement("div");
		dataCountDiv.setAttribute('class','item');
		dataCountDiv.setAttribute('id','item embeddatasource');
		dataCountDiv.innerHTML = "<div class='countValue'><h2>"+dataEmbedCount+"</h2></div><div class='countTitle'>workbook data sources</div>";
		statsContainer.appendChild(dataCountDiv);
		var taskCountDiv = document.createElement("div");
		taskCountDiv.setAttribute('class','item');
		taskCountDiv.setAttribute('id','item task');
		taskCountDiv.innerHTML = "<div class='countValue'><h2>"+taskCount+"</h2></div><div class='countTitle'>tasks</div>";
		statsContainer.appendChild(taskCountDiv);
		var subscriptionCountDiv = document.createElement("div");
		subscriptionCountDiv.setAttribute('class','item');
		subscriptionCountDiv.setAttribute('id','item subscription');
		subscriptionCountDiv.innerHTML = "<div class='countValue'><h2>"+subscriptionCount+"</h2></div><div class='countTitle'>subscriptions</div>";
		statsContainer.appendChild(subscriptionCountDiv);
		contentWrapper.appendChild(statsContainer);
		document.body.appendChild(contentWrapper);
		loadIndexModal();
		loadEmailModal();
		loadWDCModal();
		//var container = document.querySelector('#statsContainer');
		var iso = new Isotope( statsContainer );
		iso.arrange({
			// options
			itemSelector: '.item',
			layoutMode: 'masonry',
			masonry: {
				columnWidth: 230,
				gutter: 10,
				isFitWidth: true
			}
		});
		iso.on('layoutComplete', function(){
			//document.querySelector('#statsContainer').style = 'static';
			//console.log("Stats Tile Layout Done!");
		});
		/*
		workbookCountDiv.addEventListener('click', function(e){
			if (this.className == 'chartTile') {
				$("#workbookChart").remove();
				this.className = 'item';
				var container = document.querySelector('#statsContainer');
				var iso = new Isotope( container );
				iso.arrange({
					// options
					itemSelector: '.item',
					layoutMode: 'masonry',
						masonry: {
							columnWidth: 210,
							gutter: 10,
							isFitWidth: true
						}
				});
				iso.on('layoutComplete', function(){
					document.querySelector('#statsContainer').style = 'static';
					//console.log("Stats Tile Layout Done!");
				});
			} else {
				this.className = 'chartTile';
				tableauDB.fetchIndexRecords("workbooks", "sitestats", "table", function(stats) {
					var chartDiv = document.createElement("div");
					chartDiv.setAttribute('id','workbookChart');
					chartDiv.setAttribute('class','chart');
					workbookCountDiv.appendChild(chartDiv);
					drawChart(stats);
				});
			}
			//Fill with sites list
			//iso.layout();
		});
		*/
}

function loadFinalGui () {
	var guiContainer = document.createElement("div");
	guiContainer.setAttribute('id','guiContainer');
  var snapDiv = document.createElement("div");
  snapDiv.setAttribute('class','slider');
  snapDiv.setAttribute('id','snapshots');
  //trendingDiv.innerHTML = "<div class='slider'><div class='countTitle'>trending</div>";
  var snapCarouselDiv = document.createElement("div");
  snapCarouselDiv.setAttribute('class','snapshotCarousel');
  snapDiv.appendChild(snapCarouselDiv);
  guiContainer.appendChild(snapDiv);
  var snapleft = $('<i id="snapLeft" class="fa fa-arrow-circle-left"></i>').appendTo(snapDiv),
    snapright = $('<i id="snapRight" class="fa fa-arrow-circle-right"></i>').appendTo(snapDiv);
	tableauDB.fetchRecords(0, "snapshots", function(snapshots) {
    if (snapshots.length > 0) {
      var snapshotTotal = snapshots.length;
			var snapshotCount = 0;
			for (var i = 0; i < snapshotTotal; i++) {
				var currentSnapshot = snapshots[i];
				tableauDB.fetchRecords(currentSnapshot.id, "viewThumbnails", function (snapshotImage) {
          var url = require('url');
          var urlParse = url.parse(serverURL);
          hostname = urlParse.hostname;
          var dir = osenv.home()+'/Yupana/snapshots/'+hostname+'/';
          snapshotImage[0].filePath = dir+snapshotImage[0].id+'.png';
					var thumbnailSpan = document.createElement("span");
					var thumbnailDiv = document.createElement("div");
					var thumbnailLink = document.createElement("a");
					var titleDiv = document.createElement("div");
					var snapshotImg = document.createElement("img");
					if (snapshotImage[0]) {
						snapshotImg.setAttribute("src", snapshotImage[0].image);
					}
					thumbnailSpan.setAttribute("class", "viewThumbnailSpan");
					thumbnailDiv.setAttribute("class", "viewThumbnailDiv");
					thumbnailDiv.appendChild(snapshotImg);
					if (snapshotImage[0]) {
						titleDiv.innerHTML = snapshotImage[0].name;
					}
					thumbnailSpan.appendChild(thumbnailDiv);
					thumbnailSpan.appendChild(titleDiv);

					thumbnailSpan.addEventListener('click', function() {
						if (currentSiteUrl!= "") {
							var link = serverURL + "/#/site/" + snapshotImage[0].siteUrl + "/views/" +snapshotImage[0].path;
						} else {
							var link = serverURL + "/" + snapshotImage[0].siteUrl + "/views/" +snapshotImage[0].path;
						}
            var mainwin = nw.Window.get();
            snapshotImage[0].link = link;
						if (currentSiteUrl != snapshotImage[0].siteUrl) {
							switchSiteResource(snapshotImage[0].siteUrl, function(response) {
                var j = 0;
                nw.Window.open ("viewer.html", {
  								position: 'center',
  								width: nw.Window.get().width,
  								height: nw.Window.get().height,
  								title: "Project Yupana - The Information Lab"
  							}, function(win) {
  								win.on ('loaded', function(){
                    win.window.haveParent(mainwin);
  									if(j==0) {
  										console.log("Openening Viz " + link);
  										win.window.loadViz(snapshotImage[0]);
  										++j;
  									}
  								});
  							});
							});
						} else {
							var j = 0;
							nw.Window.open ("viewer.html", {
								position: 'center',
								width: nw.Window.get().width,
								height: nw.Window.get().height,
								title: "Project Yupana - The Information Lab"
							}, function(win) {
								win.on ('loaded', function(){
                  win.window.haveParent(mainwin);
									if(j==0) {
										console.log("Openening Viz " + link);
										win.window.loadViz(snapshotImage[0]);
										++j;
									}
								});
							});
						}

					});

					$('.snapshotCarousel').append(thumbnailSpan);
					snapshotCount++;
					if(snapshotCount == snapshotTotal) {
						$('.snapshotCarousel').slick({
							slidesToShow: 4,
						  slidesToScroll: 3,
							adaptiveHeight: true,
							variableWidth: true,
							draggable: true,
							arrows: true,
							prevArrow: $('#snapLeft'),
							nextArrow: $('#snapRight')
						});
						$('#snapshots').append("<div class='countTitle'>your snapshots</div>");
            var iso = new Isotope( document.getElementById('guiContainer' ) );
					}
		      //URL.revokeObjectURL(imgURL);
				});
				//carouselDiv.appendChild(thumbnailDiv);
			}
    } else {
      $('#snapshots').remove();
      var iso = new Isotope( document.getElementById('guiContainer' ) );
    }
  });

	var favDiv = document.createElement("div");
	favDiv.setAttribute('class','slider');
	favDiv.setAttribute('id','favorites');
	//trendingDiv.innerHTML = "<div class='slider'><div class='countTitle'>trending</div>";
	var favCarouselDiv = document.createElement("div");
	favCarouselDiv.setAttribute('class','favCarousel');
	favDiv.appendChild(favCarouselDiv);
	guiContainer.appendChild(favDiv);
	var favleft = $('<i id="favLeft" class="fa fa-arrow-circle-left"></i>').appendTo(favDiv),
    favright = $('<i id="favRight" class="fa fa-arrow-circle-right"></i>').appendTo(favDiv);
	tableauDB.fetchIndexRange([1], [2], "views", "favorite", function(favViews) {
		if (favViews.length > 0) {
			var favViewTotal = favViews.length;
			var favViewCount = 0;
			for (var i = 0; i < favViewTotal; i++) {
				var currentView = favViews[i];
				tableauDB.fetchRecords(currentView.id, "viewThumbnails", function (favImage) {
					var thumbnailSpan = document.createElement("span");
					var thumbnailDiv = document.createElement("div");
					var thumbnailLink = document.createElement("a");
					var titleDiv = document.createElement("div");
					var thumbnailImg = document.createElement("img");
					if (favImage[0]) {
						thumbnailImg.setAttribute("src", favImage[0].image);
					}
					thumbnailSpan.setAttribute("class", "viewThumbnailSpan");
					thumbnailDiv.setAttribute("class", "viewThumbnailDiv");
					thumbnailDiv.appendChild(thumbnailImg);
					if (favImage[0]) {
						titleDiv.innerHTML = favImage[0].name;
					}
					thumbnailSpan.appendChild(thumbnailDiv);
					thumbnailSpan.appendChild(titleDiv);

					thumbnailSpan.addEventListener('click', function() {
						if (currentSiteUrl!= "") {
							var link = serverURL + "/#/site/" + favImage[0].siteUrl + "/views/" +favImage[0].path;
						} else {
							var link = serverURL + "/" + favImage[0].siteUrl + "/views/" +favImage[0].path;
						}
            var mainwin = nw.Window.get();
            favImage[0].link = link;
            console.log(currentSiteUrl);
            console.log(favImage[0].siteUrl);
						if (currentSiteUrl != favImage[0].siteUrl) {
							switchSiteResource(favImage[0].siteUrl, function(response) {
                var j = 0;
                nw.Window.open ("viewer.html", {
  								position: 'center',
  								width: nw.Window.get().width,
  								height: nw.Window.get().height,
  								title: "Project Yupana - The Information Lab"
  							}, function(win) {
  								win.on ('loaded', function(){
                    win.window.haveParent(mainwin);
  									if(j==0) {
  										console.log("Openening Viz " + link);
  										win.window.loadViz(favImage[0]);
  										++j;
  									}
  								});
  							});
							});
						} else {
							var j = 0;
							nw.Window.open ("viewer.html", {
								position: 'center',
								width: nw.Window.get().width,
								height: nw.Window.get().height,
								title: "Project Yupana - The Information Lab"
							}, function(win) {
								win.on ('loaded', function(){
                  win.window.haveParent(mainwin);
									if(j==0) {
										console.log("Openening Viz " + link);
										win.window.loadViz(favImage[0]);
										++j;
									}
								});
							});
						}

					});

					$('.favCarousel').append(thumbnailSpan);
					favViewCount++;
					if(favViewCount == favViewTotal) {
						$('.favCarousel').slick({
							slidesToShow: 4,
						  slidesToScroll: 3,
							adaptiveHeight: true,
							variableWidth: true,
							draggable: true,
							arrows: true,
							prevArrow: $('#favLeft'),
							nextArrow: $('#favRight')
						});
						$('#favorites').append("<div class='countTitle'>your favorites</div>");
            var iso = new Isotope( document.getElementById('guiContainer' ) );
					}
		      //URL.revokeObjectURL(imgURL);
				});
				//carouselDiv.appendChild(thumbnailDiv);
			}
		} else {
			$('#favorites').remove();
      var iso = new Isotope( document.getElementById('guiContainer' ) );
		}
	});

	var trendingDiv = document.createElement("div");
	trendingDiv.setAttribute('class','slider');
	trendingDiv.setAttribute('id','trending');
	var carouselDiv = document.createElement("div");
	carouselDiv.setAttribute('class','trendingCarousel');
	trendingDiv.appendChild(carouselDiv);
	guiContainer.appendChild(trendingDiv);
	var left = $('<i id="trendLeft" class="fa fa-arrow-circle-left"></i>').appendTo(trendingDiv),
    right = $('<i id="trendRight" class="fa fa-arrow-circle-right"></i>').appendTo(trendingDiv);
	$('.content-wrap').append(guiContainer);
	tableauDB.fetchIndexRange([11], [999999999999], "views", "trending", function(views) {
		if (views.length > 0) {
			var orderViews = views.reverse();
			var viewLength = orderViews.length;
			if (viewLength>20) {
				viewLength = 20;
			}
			var viewCount = 0;
			for (var i = 0; i < viewLength; i++) {
				var currentView = orderViews[i];
				tableauDB.fetchRecords(currentView.id, "viewThumbnails", function (image) {
					var thumbnailSpan = document.createElement("span");
					var thumbnailDiv = document.createElement("div");
					var thumbnailLink = document.createElement("a");
					var titleDiv = document.createElement("div");
					var thumbnailImg = document.createElement("img");
					if (image[0]) {
						thumbnailImg.setAttribute("src", image[0].image);
					}
					thumbnailSpan.setAttribute("class", "viewThumbnailSpan");
					thumbnailDiv.setAttribute("class", "viewThumbnailDiv");
					thumbnailDiv.appendChild(thumbnailImg);
					if (image[0]) {
						titleDiv.innerHTML = image[0].name + "<br/><i>" + image[0].usageInfo.hitsLastOneMonthTotal + " views</i>";
					}
					thumbnailSpan.appendChild(thumbnailDiv);
					thumbnailSpan.appendChild(titleDiv);

					thumbnailSpan.addEventListener('click', function() {
						var link = serverURL + "/#/site/" + image[0].siteUrl + "/views/" +image[0].path;
            image[0].link = link;
            var mainwin = nw.Window.get();
            console.log(currentSiteUrl);
            console.log(image[0].siteUrl);

						if (currentSiteUrl != image[0].siteUrl) {
							switchSiteResource(image[0].siteUrl, function(response) {
                var j = 0;
                nw.Window.open ("viewer.html", {
  								position: 'center',
  								width: nw.Window.get().width,
  								height: nw.Window.get().height,
  								title: "Project Yupana - The Information Lab"
  							}, function(win) {
                  console.log("Window launched");
  								win.on('loaded', function(){
                    win.window.haveParent(mainwin);
  									if(j==0) {
  										console.log("Openening Viz " + link);
  										win.window.loadViz(image[0]);
  										++j;
  									}
  								});
  							});
							});
						} else {
              var j = 0;
              nw.Window.open ("viewer.html", {
								position: 'center',
								width: nw.Window.get().width,
								height: nw.Window.get().height,
								title: "Project Yupana - The Information Lab"
							}, function(win) {
                console.log("Window launched");
								win.on('loaded', function(){
                  win.window.haveParent(mainwin);
									if(j==0) {
										console.log("Openening Viz " + link);
										win.window.loadViz(image[0]);
										++j;
									}
								});
							});
						}

					});

					$('.trendingCarousel').append(thumbnailSpan);
					viewCount++;
					if(viewCount == viewLength) {
						$('.trendingCarousel').slick({
						  slidesToShow: 5,
						  slidesToScroll: 3,
							adaptiveHeight: true,
							variableWidth: true,
							draggable: true,
							arrows: true,
							prevArrow: $('#trendLeft'),
							nextArrow: $('#trendRight')
						});
						$('#trending').append("<div class='countTitle'>what's trending</div>");
            var iso = new Isotope( document.getElementById('guiContainer' ) );
					}
		      //URL.revokeObjectURL(imgURL);
				});
				//carouselDiv.appendChild(thumbnailDiv);
			}
		} else {
			$('#trending').remove();
      var iso = new Isotope( document.getElementById('guiContainer' ) );
		}
	});

	var iso = new Isotope( guiContainer );
	iso.arrange({
		// options
		itemSelector: '.slider',
		layoutMode: 'vertical'
	});
	iso.on('layoutComplete', function(){

	});
}

function loadNavBar () {
	var navbar = document.createElement("nav");
	navbar.setAttribute('class','navbar navbar-default navbar-fixed-top');
	var containerDiv = document.createElement("div");
	containerDiv.setAttribute('class','container-fluid');
	var toggleButton = document.createElement("button");
	toggleButton.setAttribute('class','btn btn-default navbar-btn yay-toggle');
	toggleButton.setAttribute('type', 'button');
	var togButtonIcon = document.createElement('i');
	togButtonIcon.setAttribute('class','fa fa-bars');
	toggleButton.appendChild(togButtonIcon);
	containerDiv.appendChild(toggleButton);
	var toggleLink = document.createElement('a');
	toggleLink.setAttribute('class','navbar-brand');
	toggleLink.setAttribute('href','#');
	containerDiv.appendChild(toggleLink);
	navbar.appendChild(containerDiv);
	document.body.appendChild(navbar);
	var yaybarDiv = document.createElement('div');
	yaybarDiv.setAttribute('class','yaybar yay-overlay');
	var nanoDiv = document.createElement('div');
	nanoDiv.setAttribute('class','nano');
	var nanoContent = document.createElement('div');
	nanoContent.setAttribute('class','nano-content');
	var menuList = document.createElement('ul');
	var menuTitle = document.createElement('li');
	menuTitle.setAttribute('class','label');
	menuTitle.innerHTML = "Yupana for Tableau Server";
	menuList.appendChild(menuTitle);
	var reindex = document.createElement('li');
	var reindexa = document.createElement('a');
	reindexa.setAttribute('href','#');
	reindexa.setAttribute('data-toggle','modal');
	reindexa.setAttribute('data-target','#reIndex');
	reindexa.innerHTML = "<i class='fa fa-refresh'></i> Reindex Server";
	reindex.appendChild(reindexa);
	menuList.appendChild(reindex);
	var exportEmail = document.createElement('li');
	var exportEmaila = document.createElement('a');
	exportEmaila.setAttribute('href','#');
	exportEmaila.setAttribute('data-toggle','modal');
	exportEmaila.setAttribute('data-target','#myModal');
	exportEmaila.innerHTML = "<i class='fa fa-envelope-o'></i> Email Stats";
	/*exportEmail.appendChild(exportEmaila);
	menuList.appendChild(exportEmail);*/
	var exportFile = document.createElement('li');
	var exportFilea = document.createElement('a');
	exportFilea.setAttribute('href','#');
	exportFilea.setAttribute('data-toggle','modal');
	exportFilea.setAttribute('data-target','#wdcModal');
	exportFilea.innerHTML = "<i class='fa fa-table'></i> Analyse in Tableau";
	exportFile.appendChild(exportFilea);
	menuList.appendChild(exportFile);
	var restartApp = document.createElement('li');
	var restartAppa = document.createElement('a');
	restartAppa.innerHTML = "<i class='fa fa-times'></i> Restart App";
	restartApp.appendChild(restartAppa);
	menuList.appendChild(restartApp);
	restartApp.addEventListener('click', function(e) {
		var win = nw.Window.get();
		win.reload();
	});
	nanoContent.appendChild(menuList);
	nanoDiv.appendChild(nanoContent);
	yaybarDiv.appendChild(nanoDiv);
	document.body.appendChild(yaybarDiv);
	toggleButton.addEventListener('click', function(e){
		if(document.body.className == 'yay-hide') {
			document.body.className = '';
		} else {
			document.body.className = 'yay-hide';
		}
	});
}

function loadIndexModal() {
	var modalDiv = document.createElement("div");
	modalDiv.setAttribute('class','modal fade');
	modalDiv.setAttribute('id','reIndex');
	modalDiv.setAttribute('tabindex','-1');
	modalDiv.setAttribute('role','dialog');
	modalDiv.setAttribute('aria-labelledby','reIndexLabel');
	modalDiv.setAttribute('aria-hidden','true');
	var modalDialog = document.createElement("div");
	modalDialog.setAttribute('class','modal-dialog');
	var modalContent = document.createElement("div");
	modalContent.setAttribute('class','modal-content');
	var modalHeader = document.createElement("div");
	modalHeader.setAttribute('class','modal-header');
	var modalCloseIcon = document.createElement("button");
	modalCloseIcon.setAttribute('class','close');
	modalCloseIcon.setAttribute('data-dismiss','modal');
	modalCloseIcon.setAttribute('aria-label','Close');
	var modalCloseSpan = document.createElement("span");
	modalCloseSpan.setAttribute('aria-hidden','true');
	modalCloseSpan.innerHTML = "&times;";
	modalCloseIcon.appendChild(modalCloseSpan);
	modalHeader.appendChild(modalCloseIcon);
	var modalTitle = document.createElement("h4");
	modalTitle.setAttribute('class','modal-title');
	modalTitle.setAttribute('id','reIndexLabel');
	modalTitle.innerHTML = "Reindex Server";
	modalHeader.appendChild(modalTitle);
	modalContent.appendChild(modalHeader);
	var modalBody = document.createElement("div");
	modalBody.setAttribute('class','modal-body');
	var formDiv = document.createElement("div");
	formDiv.setAttribute('class','reIndexForm');
	formDiv.setAttribute('id','reIndexForm');
	var dataSubmit = document.createElement("button");
	dataSubmit.setAttribute('id','dataSubmit');
	dataSubmit.innerHTML = "Start Index";
	dataSubmit.addEventListener('click', reIndexServer);
	formDiv.appendChild(dataSubmit);
	modalBody.appendChild(formDiv);
	modalContent.appendChild(modalBody);
	var modalFooter = document.createElement("div");
	modalFooter.setAttribute('class','modal-footer');
	modalFooter.innerHTML = "<button type='button' class='btn btn-default' data-dismiss='modal'>Close</button>";
	modalContent.appendChild(modalFooter);
	modalDialog.appendChild(modalContent);
	modalDiv.appendChild(modalDialog);
	document.body.appendChild(modalDiv);
}

function loadEmailModal() {
	var modalDiv = document.createElement("div");
	modalDiv.setAttribute('class','modal fade');
	modalDiv.setAttribute('id','myModal');
	modalDiv.setAttribute('tabindex','-1');
	modalDiv.setAttribute('role','dialog');
	modalDiv.setAttribute('aria-labelledby','myModalLabel');
	modalDiv.setAttribute('aria-hidden','true');
	var modalDialog = document.createElement("div");
	modalDialog.setAttribute('class','modal-dialog');
	var modalContent = document.createElement("div");
	modalContent.setAttribute('class','modal-content');
	var modalHeader = document.createElement("div");
	modalHeader.setAttribute('class','modal-header');
	var modalCloseIcon = document.createElement("button");
	modalCloseIcon.setAttribute('class','close');
	modalCloseIcon.setAttribute('data-dismiss','modal');
	modalCloseIcon.setAttribute('aria-label','Close');
	var modalCloseSpan = document.createElement("span");
	modalCloseSpan.setAttribute('aria-hidden','true');
	modalCloseSpan.innerHTML = "&times;";
	modalCloseIcon.appendChild(modalCloseSpan);
	modalHeader.appendChild(modalCloseIcon);
	var modalTitle = document.createElement("h4");
	modalTitle.setAttribute('class','modal-title');
	modalTitle.setAttribute('id','myModalLabel');
	modalTitle.innerHTML = "Email Stats";
	modalHeader.appendChild(modalTitle);
	modalContent.appendChild(modalHeader);
	var modalBody = document.createElement("div");
	modalBody.setAttribute('class','modal-body');
	var formDiv = document.createElement("div");
	formDiv.setAttribute('class','emailForm');
	formDiv.setAttribute('id','emailForm');
	var table = document.createElement("table");
	var nameRow = document.createElement("tr"), emailRow = document.createElement("tr"), toRow = document.createElement("tr");
	var nameInputCell = document.createElement("td"), emailInputCell = document.createElement("td"), toInputCell = document.createElement("td");
	var nameInput = document.createElement("input"), emailInput = document.createElement("input"), toInput = document.createElement("input");
	nameInput.setAttribute('type','text');
	emailInput.setAttribute('type','text');
	toInput.setAttribute('type','text');
	nameInput.setAttribute('id','nameInput');
	emailInput.setAttribute('id','emailInput');
	toInput.setAttribute('id','toInput');
	nameInputCell.appendChild(nameInput);
	nameRow.appendChild(nameInputCell);
	table.appendChild(nameRow);
	emailInputCell.appendChild(emailInput);
	emailRow.appendChild(emailInputCell);
	table.appendChild(emailRow);
	toInputCell.appendChild(toInput);
	toRow.appendChild(toInputCell);
	table.appendChild(toRow);
	formDiv.appendChild(table);
	var dataSubmit = document.createElement("button");
	dataSubmit.setAttribute('id','dataSubmit');
	dataSubmit.innerHTML = "Submit";
	//dataSubmit.addEventListener('click', sendData);
	formDiv.appendChild(dataSubmit);
	modalBody.appendChild(formDiv);
	modalContent.appendChild(modalBody);
	var modalFooter = document.createElement("div");
	modalFooter.setAttribute('class','modal-footer');
	modalFooter.innerHTML = "<button type='button' class='btn btn-default' data-dismiss='modal'>Close</button>";
	modalContent.appendChild(modalFooter);
	modalDialog.appendChild(modalContent);
	modalDiv.appendChild(modalDialog);
	document.body.appendChild(modalDiv);
}

function loadWDCModal() {
	var modalDiv = document.createElement("div");
	modalDiv.setAttribute('class','modal fade');
	modalDiv.setAttribute('id','wdcModal');
	modalDiv.setAttribute('tabindex','-1');
	modalDiv.setAttribute('role','dialog');
	modalDiv.setAttribute('aria-labelledby','wdcModalLabel');
	modalDiv.setAttribute('aria-hidden','true');
	var modalDialog = document.createElement("div");
	modalDialog.setAttribute('class','modal-dialog');
	var modalContent = document.createElement("div");
	modalContent.setAttribute('class','modal-content');
	var modalHeader = document.createElement("div");
	modalHeader.setAttribute('class','modal-header');
	var modalCloseIcon = document.createElement("button");
	modalCloseIcon.setAttribute('class','close');
	modalCloseIcon.setAttribute('data-dismiss','modal');
	modalCloseIcon.setAttribute('aria-label','Close');
	var modalCloseSpan = document.createElement("span");
	modalCloseSpan.setAttribute('aria-hidden','true');
	modalCloseSpan.innerHTML = "&times;";
	modalCloseIcon.appendChild(modalCloseSpan);
	modalHeader.appendChild(modalCloseIcon);
	var modalTitle = document.createElement("h4");
	modalTitle.setAttribute('class','modal-title');
	modalTitle.setAttribute('id','wdcModalLabel');
	modalTitle.innerHTML = "Export Data via Web Data Connector";
	modalHeader.appendChild(modalTitle);
	modalContent.appendChild(modalHeader);
	var modalBody = document.createElement("div");
	modalBody.setAttribute('class','modal-body');
	var wdcHTML = "To access the data held by Yupana for analysis:<ol><li>open Tableau Desktop (version 9.1 or greater)</li><li>Select 'Web Data Connector' from the Connect to a Server list</li><li>Enter http://localhost:8000 into the address bar & follow further instructions</li></ol><img src='./images/wdc.png' width='570'/>";
	modalBody.innerHTML = wdcHTML;
	modalContent.appendChild(modalBody);
	var modalFooter = document.createElement("div");
	modalFooter.setAttribute('class','modal-footer');
	modalFooter.innerHTML = "<button type='button' class='btn btn-default' data-dismiss='modal'>Close</button>";
	modalContent.appendChild(modalFooter);
	modalDialog.appendChild(modalContent);
	modalDiv.appendChild(modalDialog);
	document.body.appendChild(modalDiv);
}

function testParent(msg) {
  console.log(msg);
}
