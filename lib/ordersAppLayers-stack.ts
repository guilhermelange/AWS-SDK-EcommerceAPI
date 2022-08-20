import * as cdk from "aws-cdk-lib"
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda"
import { Construct } from "constructs"
import { Lambda } from "aws-sdk";

export class OrdersAppLayersStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: cdk.StackProps) {
        super(scope, id, props);

        const ordersLayer = new lambda.LayerVersion(this, "OrdersLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X, lambda.Runtime.NODEJS_16_X],
            layerVersionName: "OrdersLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrdersLayerVersionArn", {
            parameterName: "OrdersLayerVersionArn",
            stringValue: ordersLayer.layerVersionArn
        })


        const ordersApiLayer = new lambda.LayerVersion(this, "OrdersApiLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersApiLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X, lambda.Runtime.NODEJS_16_X],
            layerVersionName: "OrdersApiLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrdersApiLayerVersionArn", {
            parameterName: "OrdersApiLayerVersionArn",
            stringValue: ordersApiLayer.layerVersionArn
        })


        const ordersEventsLayer = new lambda.LayerVersion(this, "OrderEventsLayer", {
            code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X, lambda.Runtime.NODEJS_16_X],
            layerVersionName: "OrderEventsLayer",
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, "OrderEventsLayerVersionArn", {
            parameterName: "OrderEventsLayerVersionArn",
            stringValue: ordersEventsLayer.layerVersionArn
        })
    }
}