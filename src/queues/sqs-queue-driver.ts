import async from 'async';
import { Consumer } from 'sqs-consumer';
import { createHash } from 'crypto';
import { Log } from '../log';
import { QueueInterface } from './queue-interface';
import { Server } from '../server';
import { SQS } from 'aws-sdk';
import { Job } from '../job';
import { v4 as uuidv4 } from 'uuid';

export class SqsQueueDriver implements QueueInterface {
    /**
     * The list of consumers with their instance.
     */
    protected queueWithConsumer: Map<string, Consumer> = new Map();

    /**
     * Initialize the Prometheus exporter.
     */
    constructor(protected server: Server) {
        //
    }

    /**
     * Add a new event with data to queue.
     */
    addToQueue(queueName: string, data: any = {}): Promise<void> {
        return new Promise(resolve => {
            let message = JSON.stringify(data);

            let params = {
                MessageBody: message,
                MessageDeduplicationId: createHash('sha256').update(message).digest('hex'),
                MessageGroupId: queueName,
                QueueUrl: this.server.options.queue.sqs.queues[queueName],
            };

            this.sqsClient().sendMessage(params, (err, data) => {
                if (this.server.options.debug) {
                    if (err) {
                        Log.errorTitle('❎ SQS client could not publish to the queue.');
                        Log.error({ data, err, params, queueName });
                    } else {
                        Log.successTitle('✅ SQS client publsihed message to the queue.');
                        Log.success({ data, err, params, queueName });
                    }
                }

                resolve();
            });
        });
    }

    /**
     * Register the code to run when handing the queue.
     */
    processQueue(queueName: string, callback: CallableFunction): Promise<void> {
        return new Promise(resolve => {
            let consumer = Consumer.create({
                queueUrl: this.server.options.queue.sqs.queues[queueName],
                sqs: this.sqsClient(),
                ...this.server.options.queue.sqs.consumer_options,
                handleMessage: async ({ Body }) => {
                    callback(
                        new Job(uuidv4(), JSON.parse(Body)),
                        () => {
                            if (this.server.options.debug) {
                                Log.successTitle('✅ SQS message processed.');
                                Log.success({ Body, queueName });
                            }
                        },
                    );
                },
            });

            consumer.start();

            this.queueWithConsumer.set(queueName, consumer);

            resolve();
        });
    }

    /**
     * Clear the queues for a graceful shutdown.
     */
    clear(): Promise<void> {
        return async.each([...this.queueWithConsumer], ([queueName, consumer]: [string, Consumer], callback) => {
            if (consumer.isRunning) {
                consumer.stop();
                callback();
            }
        });
    }

    /**
     * Get the SQS client.
     */
    protected sqsClient(): SQS {
        let sqsOptions = this.server.options.queue.sqs;

        return new SQS({
            apiVersion: '2012-11-05',
            region: sqsOptions.region || 'us-east-1',
            ...sqsOptions.client_options,
        });
    }
}
