const request = require('request');

const uuidV4 = require("uuidv4");
const Response = require("../libs/response-lib");

const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);

var tenantURL   = configuration.url.tenant;
var userURL   = configuration.url.user;
const AWS = require('aws-sdk');

const RequestHelper = require('../libs/request-helper');
const serviceDiscovery = require('../serviceDiscovery/serviceDiscovery-helper');

class Admin {
    constructor(event) {
        this.res = new Response();
    }

    async health(event) {
        console.log("System Health Check");
        return new Promise((resolve,reject) => {
            resolve( {service: 'Tenant Registration', isAlive: true} );
        });
    }

    hashCode(s) {
        for(var i = 0, h = 0; i < s.length; i++)
            h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return h;
    }

    async create(event) {

        var tenant = JSON.parse(event.body);

        if (typeof tenant === "string") {
            tenant = JSON.parse(tenant); // stringified twice somewhere create object.
        }


        // Generate the tenant id for the system user
        tenant.id = 'SAASQSADMIN' + uuidV4();
        tenant.id = tenant.id.split('-').join('');
        console.log('Creating system admin user, tenant =  ' );
        console.log(tenant);
        tenant.user_id = 'USER' +uuidV4();
        tenant.user_id = tenant.user_id.split('-').join('');
        console.log('Creating Tenant ID: ' + tenant.id);

        tenant.id_key =  this.hashCode(tenant.id)
        tenant.user_id_key = this.hashCode(tenant.user_id)
        console.log("check 3---"+JSON.stringify(tenant))



        tenant.tenant_type = "T"
        tenant.tenant_sdo_id = "0"
        tenant.tenant_alias = tenant.tenant_alias ? tenant.tenant_alias : tenant.id;
        tenant.tenant_name = tenant.tenant_name ? tenant.tenant_name : tenant.id; 
       // tenant.tier = tenant.tier ? tenant.tier : "Free"
        tenant.tenant_subscription_as_of_datetime = null
        tenant.tenant_subscription_expiration_datetime = ""
        tenant.tenant_subscription_cancelation_datetime = ""
        tenant.tenant_subscription_canceled_by_user = null
        tenant.tenant_trial_as_of_datetime = ""
        tenant.tenant_trial_expiration_datetime = ""
        tenant.tenant_trial_cancelation_datetime = ""
        tenant.tenant_cancelation_reason = null
        tenant.tenant_auto_renew = null
        tenant.tenant_logo_url = null
        tenant.tenant_photo_url = null
        tenant.status = "Active"
        tenant.status_change_datetime = ""
        tenant.created_datetime = ""
        tenant.created_by_user = null
        tenant.last_modified_datetime = ""
        tenant.last_modified_by_user = null
        tenant.marked_for_deletion_datetime = ""
        tenant.marked_for_deletion_by_user = null  
        //tenant.id_key =  this.hashCode(tenant.id)
        //tenant.id_key = tenant.id_key.split('-').join('');
        console.log("---222-----")
        tenant.account_name =  tenant.account_name ? tenant.account_name : tenant.company_name;
        tenant.company_name = tenant.company_name ? tenant.company_name : tenant.account_name;
        tenant.owner_name =  tenant.owner_name ? tenant.owner_name : tenant.email;
        tenant.email = tenant.email ? tenant.email : tenant.user_name;
        console.log("----3333--")
        /**
        tenant.companyName = tenant.companyName ? tenant.companyName : tenant.accountName;
        tenant.accountName =  tenant.accountName ? tenant.accountName : tenant.companyName;
        tenant.ownerName =  tenant.ownerName ? tenant.ownerName : tenant.userName;
        tenant.email =  tenant.email ? tenant.email : tenant.userName;
        */
        tenant.tier = tenant.tier ? tenant.tier : "System";        
        tenant.role = tenant.role ? tenant.role : "SystemAdmin";
        console.log("--check--111-----")
        return new Promise( function(resolve,reject) {
            // if the system admin user doesn't exist, create one
            tenantExists(tenant)
                .then((msg) => {
                    console.log("Error registering new system admin user");
                    reject("Error registering new system admin user");
                })
                .catch((err) => {
                    console.log('no tenant try Creating system admin user, tenant userName: ' + tenant.userName);
                    registerTenantAdmin(tenant)
                        .then( function (tenData) {

                            //Adding Data to the Tenant Object that will be required to cleaning up all created resources for all tenants.
                            
                            /**
                            tenant.UserPoolId = tenData.pool.UserPool.Id;
                            tenant.IdentityPoolId = tenData.identityPool.IdentityPoolId;

                            tenant.systemAdminRole = tenData.role.systemAdminRole;
                            tenant.systemSupportRole = tenData.role.systemSupportRole;
                            tenant.trustRole = tenData.role.trustRole;

                            tenant.systemAdminPolicy = tenData.policy.systemAdminPolicy;
                            tenant.systemSupportPolicy = tenData.policy.systemSupportPolicy;
                             */


                            tenant.identity_pool_id  = tenData.identityPool.IdentityPoolId;
                            tenant.user_pool_id = tenData.pool.UserPool.Id;
                            tenant.system_admin_policy = tenData.policy.systemAdminPolicy;
                            tenant.system_admin_role = tenData.role.systemAdminRole;
                            tenant.system_support_policy = tenData.policy.systemSupportPolicy;
                            tenant.system_support_role= tenData.role.systemSupportRole;
                            tenant.trust_role = tenData.role.trustRole;
                            
                            console.log('User created save Tenant Data ' );
                            return saveTenantData(tenant);
                        })
                        .then(function () {
                            console.log("System admin user registered: " + tenant.id);
                            resolve("System admin user " + tenant.id + " registered");
                        })
                        .catch(function (error) {
                                console.log("Error registering new system admin user: " + error.message);
                            reject("Error registering system admin user: " + error.message);
                        });
                });
        });
    }

   }

/**
 * Determine if a system admin user can be created (they may already exist)
 * @param tenant The tenant data
 * @param callback
 * @returns True if the tenant exists
 */
function tenantExists(tenant) {
    // Create URL for user-manager request
    var userExistsUrl = userURL + '/pool/' + tenant.userName;

    return new Promise( (resolve,reject) => {
        // see if the user already exists
        //functionName = 'SaaSServerless-UserMgr-dev-lookupPool';
        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'UserMgr','lookupPool',process.env.stage);

        var payLoad = {userName: tenant.userName};

        RequestHelper.invokeLambda(functionName,payLoad)
            .then((data) => {
                resolve(data);
            })
            .catch((err) => {
                console.log("invokeLambda returned ERROR err = ");
                console.log(err);
                reject(err);
            })


    });
};

/**
 * Register a new tenant user and provision policies for that user
 * @param tenant The new tenant data
 * @returns {Promise} Results of tenant provisioning
 */
function registerTenantAdmin(tenant) {
    console.log("call to registerTenantAdmin: ");

    var promise = new Promise(function(resolve, reject) {

        // init the request with tenant data
        var tenantAdminData = {
            /*
            "tenant_id": tenant.id,
            "companyName": tenant.companyName ? tenant.companyName : tenant.accountName,
            "accountName": tenant.accountName ? tenant.accountName : tenant.companyName,
            "ownerName": tenant.ownerName ? tenant.ownerName : tenant.userName,
            "tier": tenant.tier? tenant.tier : "System",
            "email": tenant.email ? tenant.email : tenant.userName,
            "userName": tenant.userName,
            "role": tenant.role ? tenant.role : "SystemAdmin",
            "firstName": tenant.firstName,
            "lastName": tenant.lastName
*/
            "tenant_id": tenant.id,
            "company_name" : tenant.company_name,
            "account_name" : tenant.account_name,
            "owner_name" : tenant.owner_name,
            "tier" : tenant.tier? tenant.tier : "System",
            "email" : tenant.email ? tenant.email : tenant.user_name,
            "user_name" : tenant.user_name,
            "role" : tenant.role ? tenant.role : "SystemAdmin",
            "first_name" : tenant.first_name,
            "last_name" : tenant.last_name,
            "id_key" : tenant.id_key,
            "user_id" : tenant.user_id,
            "user_id_key" : tenant.user_id_key,
            "tenant_id_key" : tenant.id_key

        };

        // REST API URL
        var registerTenantUserURL = userURL + '/system';

       // functionName = 'SaaSServerless-UserMgr-dev-createSystem';
        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'UserMgr','createSystem',process.env.stage);

        RequestHelper.invokeLambda(functionName,tenantAdminData)
            .then((data) => {
                resolve(data);
            })
            .catch((err) => {
                console.log("invokeLambda returned ERROR err = ");
                console.log(err);
                reject(err);
            })


/*****       CHECK ERROR FORMAT for returning errors????  is Default ok, or match below?
 *      request({
            url: registerTenantUserURL,
            method: "POST",
            json: true,
            headers: {"content-type": "application/json"},
            body: tenantAdminData
        }, function (error, response, body) {
            console.log("registerTenantUserURL returned error = " + error );
            console.log("registerTenantUserURL returned response.statusCode  = " + response.statusCode  );
            //console.log("registerTenantUserURL returned response   = "  );
            //console.log(response );

            if (error || (response.statusCode != 200)) {
                if (error === null) {
                    body = response.body;
                    console.log("registerTenantUserURL  body   = "  );
                    console.log(body );
                    error= {"message" : "Error reponse code '"+body.msg+"'"};
                }
                console.log("registerTenantUserURL calling reject error = " );
                console.log(error );
                reject(error);
            } else {
                console.log("registerTenantUserURL calling resolve body = " + body );
                resolve(body);
            }
        });
 ********/
    });
    return promise;
}

/**
 * Save the configuration and status of the new tenant
 * @param tenant Data for the tenant to be created
 * @returns {Promise} The created tenant
 */
function saveTenantData(tenant) {
    var promise = new Promise(function(resolve, reject) {
        // init the tenant sace request
        var tenantRequestData = {
            "id": tenant.id,
            /**
            "companyName": tenant.companyName,
            "accountName": tenant.accountName,
            "ownerName": tenant.ownerName,
            "tier": tenant.tier,
            "email": tenant.email,
            "status": "Active",
            "UserPoolId": tenant.UserPoolId,
            "IdentityPoolId": tenant.IdentityPoolId,
            "systemAdminRole": tenant.systemAdminRole,
            "systemSupportRole": tenant.systemSupportRole,
            "trustRole": tenant.trustRole,
            "systemAdminPolicy": tenant.systemAdminPolicy,
            "systemSupportPolicy": tenant.systemSupportPolicy,
            "userName": tenant.userName,
             */

             "company_name" : tenant.company_name,
             "account_name" : tenant.account_name,
             "owner_name"  : tenant.owner_name,
             "tier" : tenant.tier,
             "email" : tenant.email,
             "status" : "Active",
             "user_pool_id" : tenant.user_pool_id,
             "identity_pool_id" : tenant.identity_pool_id,
             "system_support_role": tenant.system_support_role,
             "trust_role" : tenant.trust_role,
             "system_admin_policy" : tenant.system_admin_policy,
             "system_support_policy" : tenant.system_support_policy,
             "user_name" : tenant.user_name,
        };

        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'TenantMgr','create',process.env.stage);

        RequestHelper.invokeLambda(functionName,tenantRequestData)
            .then((data) => {
                resolve(data);
            })
            .catch((err) => {
                console.log("invokeLambda returned ERROR err = ");
                console.log(err);
                reject(err);
            })
    });

    return promise;
}

module.exports = Admin;
