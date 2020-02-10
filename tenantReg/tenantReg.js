
const uuidV4 = require("uuidv4");

// Configure Environment
const configModule = require('../libs/config-helper.js');
var configuration = configModule.configure(process.env.stage);

var tenantURL   = configuration.url.tenant;
var userURL   = configuration.url.user;

const AWS = require('aws-sdk');

// Configure AWS Region
AWS.config.update({region: configuration.aws_region});

const RequestHelper = require('../libs/request-helper');
const serviceDiscovery = require('../serviceDiscovery/serviceDiscovery-helper');

class TenantReg {

    constructor(event) {
        this.body = JSON.parse(event.body);
    }
    async health(event) {
        console.log("Tenant Registration Health Check");
        return new Promise((resolve, reject) => {
            resolve({service: 'Tenant Registration', isAlive: true});
        });
    }

    hashCode(s) {
        for(var i = 0, h = 0; i < s.length; i++)
            h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        return h;
    }


    async register(event) {
        var tenant = JSON.parse(event.body);
        if (typeof tenant === "string") {
            tenant = JSON.parse(tenant); // stringified twice somewhere create object.
        }
        console.log("check 1---")
        tenant.tenant_type = "T"
        tenant.tenant_sdo_id = "0"
        tenant.tenant_alias = tenant.tenant_alias ? tenant.tenant_alias : tenant.tenant_name;
        tenant.tenant_name = tenant.tenant_name ? tenant.tenant_name : tenant.tenant_alias; 
        tenant.tier = tenant.tier ? tenant.tier : "Free"
        tenant.tenant_subscription_as_of_datetime = ""
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

        tenant.account_name =  tenant.account_name ? tenant.account_name : tenant.company_name;
        tenant.company_name = tenant.company_name ? tenant.company_name : tenant.account_name;
        tenant.owner_name =  tenant.owner_name ? tenant.owner_name : tenant.email;
        tenant.email = tenant.email ? tenant.email : tenant.user_name;

        /**
        tenant.companyName = tenant.companyName ? tenant.companyName : tenant.accountName;
        tenant.accountName =  tenant.accountName ? tenant.accountName : tenant.companyName;
        tenant.ownerName =  tenant.ownerName ? tenant.ownerName : tenant.userName;
        tenant.email =  tenant.email ? tenant.email : tenant.userName;
        */       
       console.log("check 2---")
        // Generate the tenant id
        tenant.id = 'TENANT' + uuidV4();
        tenant.user_id = 'USER' +uuidV4();
        console.log('Creating Tenant ID: ' + tenant.id);
        tenant.id = tenant.id.split('-').join('');
        tenant.user_id = tenant.user_id.split('-').join('');

        tenant.id_key =  this.hashCode(tenant.id)
        tenant.user_id_key = this.hashCode(tenant.user_id)
        console.log("check 3---"+JSON.stringify(tenant))
        return new Promise(function (resolve, reject) {

// if the tenant doesn't exist, create one
                tenantExists(tenant)
                    .then((msg) => {
                        console.log("Error registering new tenant");
                        reject("Error registering new tenant");
                    })
                    .catch((err) => {
                        console.log('no tenant try Creating tenant user, tenant = '+tenant);
                        console.log(tenant);
                        var returnCode = null;
                        console.log("check 4---"+tenant)
                        registerTenantAdmin(tenant)
                            .then(function (tenData) {
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
                               console.log("check 5---"+JSON.stringify(tenData))
                               tenant.identity_pool_id  = tenData.identityPool.IdentityPoolId;
                               tenant.user_pool_id = tenData.pool.UserPool.Id;
                               tenant.system_admin_policy = tenData.policy.systemAdminPolicy;
                               tenant.system_admin_role = tenData.role.systemAdminRole;
                               tenant.system_support_policy = tenData.policy.systemSupportPolicy;
                               tenant.system_support_role= tenData.role.systemSupportRole;
                               tenant.trust_role = tenData.role.trustRole;
                               console.log("check 6---"+JSON.stringify(tenant))
                                return saveTenantData(tenant)
                            })
                            .then(function () {
                                console.log("Tenant registered: " + tenant.id);
                                resolve("Tenant " + tenant.id + " registered");
                                return;
                            })
                            .catch(function (error) {
                                console.log("Error registering new tenant: " + error.message);
                                returnCode = error;
                                removeTenantData(tenant)
                                    .then((result)=> {console.log("Removed data sucess")})
                                    .catch((rmError) => {console.log("Remove Tenata Data error - "+rmError)});

                                reject("Error registering tenant: " + error.message);
                            });


                        return returnCode;

                    });

            });
    }

}
console.log("after class....");

/**
 * Determine if a tenant can be created (they may already exist)
 * @param tenant The tenant data
 * @returns True if the tenant exists
 */
async function tenantExists(tenant) {
    // Create URL for user-manager request
    //var userExistsUrl = userURL + '/pool/' + tenant.userName;
    var userExistsUrl = userURL + '/pool/' + tenant.email;
    return new Promise((resolve,reject) => {
        // see if the user already exists
        //var payLoad = {userName: tenant.userName};
        var payLoad = {user_name: tenant.email, new_tenant: tenant};
        console.log("create payload---pld--"+JSON.stringify(payLoad))
        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'UserMgr','lookupPool',process.env.stage);

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
console.log("after tenantExists....");

/**
 * Register a new tenant user and provision policies for that user
 * @param tenant The new tenant data
 * @returns {Promise} Results of tenant provisioning
 */
async function registerTenantAdmin(tenant) {
    console.log("check process tenant--"+JSON.stringify(tenant))
    var promise = new Promise(function(resolve, reject) {
        // init the request with tenant data
        var tenantAdminData = {
            /** 
            "tenant_id": tenant.id,
            "companyName": tenant.companyName,
            "accountName": tenant.accountName,
            "ownerName": tenant.ownerName,
            "tier": tenant.tier,
            "email": tenant.email,
            "userName": tenant.userName,
            "role": tenant.role,
            "firstName": tenant.firstName,
            "lastName": tenant.lastName
            */

            "tenant_id": tenant.id,
            "company_name" : tenant.company_name,
            "account_name" : tenant.account_name,
            "owner_name" : tenant.owner_name,
            "tier" : tenant.tier,
            "email" : tenant.email,
            "user_name" : tenant.user_name,
            "role" : tenant.role,
            "first_name" : tenant.first_name,
            "last_name" : tenant.last_name,
            "id_key" : tenant.id_key,
            "user_id" : tenant.user_id,
            "user_id_key" : tenant.user_id_key,
            "tenant_id_key" : tenant.id_key

        };

        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'UserMgr','reg',process.env.stage);
        console.log("check 4.1---------------"+JSON.stringify(tenantAdminData))
        RequestHelper.invokeLambda(functionName,tenantAdminData)
            .then((data) => {
                console.log("check 4.2--------------"+JSON.stringify(data))
                resolve(data);
            })  
            .catch((err) => {
                console.log("invokeLambda returned ERROR err = "+err);
                console.log(err);
                reject(err);
            })
    });

    return promise;
}

/**
 * Save the configration and status of the new tenant
 * @param tenant Data for the tenant to be created
 * @returns {Promise} The created tenant
 */
async function saveTenantData(tenant) {
    console.log("check 6---"+JSON.stringify(tenant))
    var promise = new Promise(function(resolve, reject) {
        // init the tenant sace request
        var currentDateTime = new Date();
        var tenantRequestData = {
            /**
            "id": tenant.id,
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
            
            "id": tenant.id,
            "company_name" : tenant.company_name,
            "account_name": tenant.account_name,
            "owner_name": tenant.owner_name,
            "tier" : tenant.tier,
            "email": tenant.email,
            "user_pool_id" : tenant.user_pool_id,
            "identity_pool_id" : tenant.identity_pool_id,
            "system_admin_role" : tenant.system_admin_role,
            "system_support_role" : tenant.system_support_role,
            "trust_role" : tenant.trust_role,
            "system_admin_policy" : tenant.system_admin_policy,
            "system_support_policy" : tenant.system_support_policy,
            "user_name" : tenant.user_name,
            "first_name" : tenant.first_name,
            "last_name" : tenant.last_name,
            "id_key" :tenant.id_key,
            

            "tenant_type" :tenant.tenant_type,
            "tenant_sdo_id" : tenant.tenant_sdo_id,
            "tenant_alias" :tenant.tenant_alias,
            "tenant_name" :tenant.tenant_name ,
            "tier" :tenant.tier,
            "tenant_subscription_as_of_datetime" : currentDateTime.toString(),
            "tenant_subscription_expiration_datetime" : currentDateTime.toString(),
            "tenant_subscription_cancelation_datetime" : currentDateTime.toString(),
            "tenant_subscription_canceled_by_user" : tenant.tenant_subscription_canceled_by_user,
            "tenant_trial_as_of_datetime" : currentDateTime.toString(),
            "tenant_trial_expiration_datetime" : currentDateTime.toString(),
            "tenant_trial_cancelation_datetime" : currentDateTime.toString(),
            "tenant_cancelation_reason" : tenant.tenant_cancelation_reason,
            "tenant_auto_renew": tenant.tenant_auto_renew,
            "tenant_logo_url" : tenant.tenant_logo_url,
            "tenant_photo_url" : tenant.tenant_photo_url,
            "status" : "Active",
            "status_change_datetime" : currentDateTime.toString(),
            "created_datetime" : currentDateTime.toString(),
            "created_by_user" :tenant.created_by_user,
            "last_modified_datetime" : currentDateTime.toString(),
            "last_modified_by_user" : tenant.last_modified_by_user,
            "marked_for_deletion_datetime" : currentDateTime.toString(),
            "marked_for_deletion_by_user" : tenant.marked_for_deletion_by_user
    
        };
        console.log("check 7--tenantRequestData-+"+tenantRequestData)
        var functionName = serviceDiscovery.getServiceName(process.env.PROJECT_NAME,'TenantMgr','create',process.env.stage);
        console.log("check 8--functionName---"+functionName)
        RequestHelper.invokeLambda(functionName,tenantRequestData)
            .then((data) => {
                console.log("check 9---")
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

module.exports = TenantReg;
