import * as lamdbaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"
import * as cdk from "aws-cdk-lib"
import * as apigateway from "aws-cdk-lib/aws-apigateway"
import * as cwlogs  from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"

interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lamdbaNodeJS.NodejsFunction;
    productsAdminHandler: lamdbaNodeJS.NodejsFunction;
    ordersHandler: lamdbaNodeJS.NodejsFunction;
}

export class ECommerceApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super(scope, id, props);

        const logGroup = new cwlogs.LogGroup(this, "ECommerceApiLogs");
        const api = new apigateway.RestApi(this, "ECommerceApi", {
            restApiName: "ECommerceApi",
            deployOptions: {
                accessLogDestination: new apigateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true
                })
            }
        })    
        
        this.createProductsService(props, api);
        this.createOrdersService(props, api);
    }

    private createOrdersService(props: ECommerceApiStackProps, api: apigateway.RestApi) {
        const ordersResource = api.root.addResource("orders");
        const ordersIntegration = new apigateway.LambdaIntegration(props.ordersHandler);

        // GET "/orders"
        // GET "/orders?email=?"
        // GET "/orders?email=?orderId=123"
        ordersResource.addMethod("GET", ordersIntegration);

        const orderDeletionValidator = new apigateway.RequestValidator(this, "OrdersDeletionValidator", {
            restApi: api,
            requestValidatorName: "OrdersDeletionValidator",
            validateRequestParameters: true
        })
        // DELETE "/orders?email=?orderId=123"
        ordersResource.addMethod("DELETE", ordersIntegration, {
            requestParameters: {
                'method.request.querystring.email': true,
                'method.request.querystring.orderId': true,
            },
            requestValidator: orderDeletionValidator
        });

        // POST "orders"
        const orderRequestValidator = new apigateway.RequestValidator(this, "OrderRequestValidator", {
            restApi: api,
            requestValidatorName: "Order request validator",
            validateRequestBody: true
        })

        const orderModel =  new apigateway.Model(this, "OrderModel", {
            modelName: "OrderModel",
            restApi: api,
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    email: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    productIds: {
                        type: apigateway.JsonSchemaType.ARRAY,
                        minItems: 1,
                        items: {
                            type: apigateway.JsonSchemaType.STRING
                        }
                    },
                    payment: {
                        type: apigateway.JsonSchemaType.STRING,
                        enum: ["CASH", "DEBIT_CARD", "CREDIT_CARD"]
                    }
                },
                required: [
                    "email",
                    "productIds",
                    "payment"
                ]
            }
        })

        ordersResource.addMethod("POST", ordersIntegration, {
            requestValidator: orderRequestValidator,
            requestModels: {
                "application/json": orderModel
            }
        });
    }

    private createProductsService(props: ECommerceApiStackProps, api: apigateway.RestApi) {
        const productsResource = api.root.addResource("products")
        const productIdResource = productsResource.addResource("{id}")

        const productsFetchIntegration = new apigateway.LambdaIntegration(props.productsFetchHandler)
        // GET "/products"
        productsResource.addMethod("GET", productsFetchIntegration)
        // GET "/products/{id}"
        productIdResource.addMethod("GET", productsFetchIntegration)


        const productsAdminIntegration = new apigateway.LambdaIntegration(props.productsAdminHandler)
        const productRequestValidator = new apigateway.RequestValidator(this, "ProductRequestValidator", {
            restApi: api,
            requestValidatorName: "Product request validator",
            validateRequestBody: true
        })

        const productModel =  new apigateway.Model(this, "ProductModel", {
            modelName: "ProductModel",
            restApi: api,
            schema: {
                type: apigateway.JsonSchemaType.OBJECT,
                properties: {
                    productName: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    code: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    model: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    productUrl: {
                        type: apigateway.JsonSchemaType.STRING
                    },
                    price: {
                        type: apigateway.JsonSchemaType.NUMBER
                    }
                },
                required: [
                    "productName",
                    "code"
                ]
            }
        })

        // POST "/products"
        productsResource.addMethod("POST", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            }
        })
        // PUT "/products/{id}"
        productIdResource.addMethod("PUT", productsAdminIntegration, {
            requestValidator: productRequestValidator,
            requestModels: {
                "application/json": productModel
            }
        })
        // DELETE "/products/{id}"
        productIdResource.addMethod("DELETE", productsAdminIntegration)
    }
}