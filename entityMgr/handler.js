const Response = require("../libs/response-lib");
var res = new Response();
const EntityMgr = require("./entityMgr");

const serviceDiscovery = require('../serviceDiscovery/serviceDiscovery-helper');
var functionRegistration = {
    health: {ttl: 300, type: "http", url: "/entity/health", status: "healthy"},
    getEntity: {ttl: 300, type: "http",  url: "/entity/", status: "healthy"},
    getEntities: {ttl: 300, type: "http", url: "/entities/",  status: "healthy"},
    create: {ttl: 300, type: "http", url: "/entity", status: "healthy"},
    update: {ttl: 300, type: "http",  url: "/entity", status: "healthy"},
    del: {ttl: 300, type: "http", url: "/entity/",  status: "healthy"},
    entityMgr: {ttl: 300, type: "http", url: "",  status: "healthy"},
}

export async function serviceRegister(event) {

    var apiURL = process.env.apiURL;
    var serviceAPI = process.env.serviceURL ;
    var prefix = process.env.PROJECT_NAME + '-' + 'EntityMgr' + '-' + process.env.stage + '-';

    try {
        var result = await serviceDiscovery.serviceRegister(functionRegistration,apiURL,serviceAPI,prefix);
        console.log("services registered!")
    }
    catch(err) {
        console.log("services registration failure!")
        return res.error(err);
    }
    return res.success(result);
}


export async function health(event) {
    var entity = new EntityMgr(event);
    try {
        var result =  await entity.health(event);
    }
    catch(err) {
        return res.error(err);
    }
    return res.success(result);
}
export async function getEntity(event) {
    var entity = new EntityMgr(event);
    try {
        var result =  await entity.getEntity(event);
    }
    catch(err) {
        return res.error(err);
    }
    return res.success(result);
}

export async function getEntities(event) {
    var entity = new EntityMgr(event);
    try {
        var result =  await entity.getEntities(event);
    }
    catch(err) {
        return res.error(err);
    }
    return res.success(result);
}


export async function create(event) {
    console.log("before product() process.env.stage = " + process.env.stage);
    var entity = new EntityMgr(event);
    try {
        var result =  await entity.create(event);
    }
    catch(err) {
        return res.error(err);
    }
    return res.success(result);
}


export async function update(event) {
    var entity = new EntityMgr(event);
    try {
        var result =  await entity.update(event);
    }
    catch(err) {
        return res.error(err);
    }
    return res.success(result);
}




export async function del(event) {
    var product = new EntityMgr(event);
    try {
        var result =  await product.del(event);
    }
    catch(err) {
        return res.error(err);
    }
    return res.success(result);
}


