import { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from "aws-lambda";
import { DynamoDB, SNS } from "aws-sdk";
import * as AWSXRay from "aws-xray-sdk";
import { CarrierType, OrderProductResponse, OrderRequest, OrderResponse, PaymentType, ShippingType } from "/opt/nodejs/ordersApiLayer";
import { Order, OrderRepository } from "/opt/nodejs/ordersLayer";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { OrderEvent, OrderEventType, Envelope } from "/opt/nodejs/orderEventsLayer"

AWSXRay.captureAWS(require("aws-sdk"));
const ordersDdb = process.env.ORDERS_DDB!;
const productsDdb = process.env.PRODUCTS_DDB!;
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN!;

const ddbClient = new DynamoDB.DocumentClient();
const snsClient = new SNS();

const orderRepository = new OrderRepository(ddbClient, ordersDdb);
const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod;
    const apiRequestId = event.requestContext.requestId;
    const lambdaRequestId = context.awsRequestId;
    console.log(`API Gateway RequestID: ${apiRequestId} - LambdaRequestId:"${lambdaRequestId}`);

    switch (method) {
        case 'GET':
            if (event.queryStringParameters) {
                const email = event.queryStringParameters!.email;
                const orderId = event.queryStringParameters!.orderId;

                if (email) {
                    if (orderId) {
                        try {
                            const order = await orderRepository.getOrder(email, orderId);
                            return {
                                statusCode: 200,
                                body: JSON.stringify(convertToOrderResponse(order))
                            }
                        } catch (error) {
                            console.log((error as Error).message);
                            return {
                                statusCode: 404,
                                body: (error as Error).message
                            }
                        }
                        
                    } else {
                        const orders = await orderRepository.getOrdersByEmail(email);
                        return {
                            statusCode: 200,
                            body: JSON.stringify(orders.map(convertToOrderResponse))
                        }
                    }
                }
            } else {
                const orders = await orderRepository.getAllOrders();
                return {
                    statusCode: 200,
                    body: JSON.stringify(orders.map(convertToOrderResponse))
                }
            }
            
            break;
        case 'POST':
            console.log('POST /orders');
            const orderRequest = JSON.parse(event.body!) as OrderRequest;
            const products = await productRepository.getProductsByIds(orderRequest.productIds);
            
            if (products.length === orderRequest.productIds.length) {
                const order = buildOrder(orderRequest, products);
                const orderCreated = await orderRepository.createOrder(order);
                const eventResult = await sendOrderEvent(orderCreated, OrderEventType.CREATED, lambdaRequestId);
                console.log(`Order created event sent - OrderId: ${orderCreated.sk}\n MessageId: ${eventResult.MessageId}`)

                return {
                    statusCode: 201,
                    body: JSON.stringify(convertToOrderResponse(orderCreated))
                }
            } else {
                return {
                    statusCode: 404,
                    body: "Some product was not found"
                }
            }

            break;
        case 'DELETE':
            console.log('DELETE /orders');
            const email = event.queryStringParameters!.email!;
            const orderId = event.queryStringParameters!.orderId!;

            try {
                const orderDeleted = await orderRepository.deleteOrder(email, orderId);
                const eventResult = await sendOrderEvent(orderDeleted, OrderEventType.DELETED, lambdaRequestId);
                console.log(`Order created event sent - OrderId: ${orderDeleted.sk}\n MessageId: ${eventResult.MessageId}`)

                return {
                    statusCode: 200,
                    body: JSON.stringify(convertToOrderResponse(orderDeleted))
                }
            } catch (error) {
                console.log((error as Error).message);
                return {
                    statusCode: 404,
                    body: (error as Error).message
                }
            }
            break;
    }

    return {
        statusCode: 400,
        body: 'Bad Request'
    }
}

function sendOrderEvent(order: Order, eventType: OrderEventType, lambdaRequestId: string) {
    const productCodes: string[] = [];
    order.products.forEach(product => {
        productCodes.push(product.code);
    })
    const orderEvent: OrderEvent = {
        email: order.pk,
        orderId: order.sk!,
        billing: order.billing,
        shipping: order.shipping,
        requestId: lambdaRequestId,
        productCodes: productCodes
    }

    const envelope: Envelope = {
        eventType: eventType,
        data: JSON.stringify(orderEvent)
    }

    return snsClient.publish({
        TopicArn: orderEventsTopicArn,
        Message: JSON.stringify(envelope)
    }).promise();
}

function convertToOrderResponse(order: Order): OrderResponse {
    const orderProducts: OrderProductResponse[] = [];
    order.products.forEach(product => {
        orderProducts.push({
            code: product.code,
            price: product.price
        })
    })

    const orderResponse: OrderResponse = {
        email: order.pk,
        id: order.sk!,
        createdAt: order.createdAt!,
        products: orderProducts,
        billing: {
            payment: order.billing.payment as PaymentType,
            totalPrice: order.billing.totalPrice
        },
        shipping: {
            type: order.shipping.type as ShippingType,
            carrier: order.shipping.carrier as CarrierType
        }
    }

    return orderResponse;
}

function buildOrder(orderRequest: OrderRequest, products: Product[]): Order {
    const orderProducts: OrderProductResponse[] = [];
    let totalPrice = 0;

    products.forEach(product => {
        totalPrice += product.price
        orderProducts.push({
            code: product.code,
            price: product.price
        })
    })
    
    const order: Order = {
        pk: orderRequest.email,
        billing: {
            payment: orderRequest.payment,
            totalPrice: totalPrice
        },
        shipping: {
            type: orderRequest.shipping.type,
            carrier: orderRequest.shipping.carrier
        },
        products: orderProducts
    }

    return order;
}