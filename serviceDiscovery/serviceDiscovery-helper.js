
const request = require('request');

module.exports.serviceRegister = function (functionList,apiURL,serviceAPI,prefix) {
    console.log("serviceRegister: register functions for "+prefix);

    return new Promise(async function (resolve, reject) {

        var serviceURL = serviceAPI + '/catalog/register';
        var keys = Object.keys(functionList);
        var promises = [];
        for (const key of keys) {
            var service = {
                serviceVersion: '1.0.0'
            }
            if (functionList[key].version)
                service.serviceVersion = functionList[key].version;

            service.ttl = functionList[key].ttl;
            service.status = functionList[key].status;
            service.serviceName = prefix + key;
            if (functionList[key].type === "internal")
                service.endpoint_url = prefix + key;
            else if (functionList[key].type === "http")
                service.endpoint_url = apiURL + functionList[key].url;
            else
                service.endpoint_url = "invalid";

            status = await registerTheService(serviceURL, service);
            promises.push(status);
            console.log("registered service = "+key+" serviceName = "+service.serviceName);

        }
        console.log("serviceRegister: done");

    });

}

async function registerTheService(serviceURL, service) {
    return new Promise( function (resolve, reject) {

        request({
            url:     serviceURL,
            method:  "POST",
            json:    true,
            headers: {
                "content-type": "application/json",
            },
            body:    service,
        }, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                resolve(body);
                return {name: service.serviceName, status: "healthy"};
            } else {
                if (!error) {
                    var lookupError = new Error("Service Error ("+response.statusCode+") error = " + response.body.Error);
                    console.log(lookupError);
                    reject(lookupError);
                    return {name: service.serviceName, status: "unhealthy"};
                } else {
                    var lookupError = "registerTheService: got error: "+error.message;
                    console.log(lookupError);
                    console.log(error);
                    reject(error)
                    return {name: service.serviceName, status: "unhealthy"};
                }
            }
        });
    });
}

module.exports.getServiceName = function(service,module,method,stage) {
    // functionName = 'SaaSServerless-UserMgr-dev-lookupPool';
    return service + '-' + module + '-' + stage + '-' + method;
}
module.exports.lookupService = function (name,version,serviceAPI) {
    console.log("lookupService:  for ----"+name);
    console.log("check 4.1.11 lookupservice---------------"+serviceAPI)
    return new Promise(async function (resolve, reject) {

        var serviceURL = serviceAPI + '/catalog/'+name+'/'+version;
        console.log("Check service dis helper --- serviceurl-"+serviceURL)
        request({
            url:     serviceURL,
            method:  "GET",
            json:    true,
            headers: {
                "content-type": "application/json",
            },
        }, function (error, response, body) {
            console.log("check sd ---- res----"+JSON.stringify(response))
            console.log("check sd ---- body----"+JSON.stringify(body))

            if (!error && response.statusCode === 200) {
                resolve(body);
                return body;
            } else {
                if (!error) {
                    var lookupError = new Error("Service Error ("+response.statusCode+") error = " + response.body.Error);
                    console.log(lookupError);
                    reject(lookupError);
                } else {
                    var lookupError = "registerTheService: got error: "+error.message;
                    console.log(lookupError);
                    console.log(error);
                    reject(error)
                }
            }
        });
    });

}