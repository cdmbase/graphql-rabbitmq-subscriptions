"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var pubsub_async_iterator_1 = require("./pubsub-async-iterator");
var rabbitmq_pub_sub_1 = require("rabbitmq-pub-sub");
var async_1 = require("async");
var child_logger_1 = require("./child-logger");
var AmqpPubSub = (function () {
    function AmqpPubSub(options) {
        if (options === void 0) { options = {}; }
        this.triggerTransform = options.triggerTransform || (function (trigger) { return trigger; });
        var config = options.config || { host: '127.0.0.1', port: 5672 };
        var logger = options.logger;
        this.logger = child_logger_1.createChildLogger(logger, 'AmqpPubSub');
        var factory = new rabbitmq_pub_sub_1.RabbitMqSingletonConnectionFactory(logger, config);
        this.consumer = new rabbitmq_pub_sub_1.RabbitMqSubscriber(logger, factory);
        this.producer = new rabbitmq_pub_sub_1.RabbitMqPublisher(logger, factory);
        this.subscriptionMap = {};
        this.subsRefsMap = {};
        this.currentSubscriptionId = 0;
        this.unsubscribeChannelMap = {};
    }
    AmqpPubSub.prototype.publish = function (trigger, payload) {
        this.logger.trace("publishing for queue '%s' (%j)", trigger, payload);
        return this.producer.publish(trigger, payload);
    };
    AmqpPubSub.prototype.subscribe = function (trigger, onMessage, options) {
        var _this = this;
        var triggerName = this.triggerTransform(trigger, options);
        var id = this.currentSubscriptionId++;
        this.subscriptionMap[id] = [triggerName, onMessage];
        var refs = this.subsRefsMap[triggerName];
        if (refs && refs.length > 0) {
            var newRefs = refs.concat([id]);
            this.subsRefsMap[triggerName] = newRefs;
            this.logger.trace("subscriber exist, adding triggerName '%s' to saved list.", triggerName);
            return Promise.resolve(id);
        }
        else {
            return new Promise(function (resolve, reject) {
                _this.logger.trace("trying to subscribe to queue '%s'", triggerName);
                _this.consumer.subscribe(triggerName, function (msg) { return _this.onMessage(triggerName, msg); })
                    .then(function (disposer) {
                    _this.subsRefsMap[triggerName] = (_this.subsRefsMap[triggerName] || []).concat([id]);
                    _this.unsubscribeChannelMap[id] = disposer;
                    return resolve(id);
                }).catch(function (err) {
                    _this.logger.error(err, "failed to recieve message from queue '%s'", triggerName);
                    reject(id);
                });
            });
        }
    };
    AmqpPubSub.prototype.unsubscribe = function (subId) {
        var _this = this;
        var _a = (this.subscriptionMap[subId] || [])[0], triggerName = _a === void 0 ? null : _a;
        var refs = this.subsRefsMap[triggerName];
        if (!refs) {
            this.logger.error("There is no subscription of id '%s'", subId);
            throw new Error("There is no subscription of id \"{subId}\"");
        }
        var newRefs;
        if (refs.length === 1) {
            newRefs = [];
            this.unsubscribeChannelMap[subId]().then(function () {
                _this.logger.trace("cancelled channel from subscribing to queue '%s'", triggerName);
            }).catch(function (err) {
                _this.logger.error(err, "channel cancellation failed from queue '%j'", triggerName);
            });
        }
        else {
            var index = refs.indexOf(subId);
            if (index !== -1) {
                newRefs = refs.slice(0, index).concat(refs.slice(index + 1));
            }
            this.logger.trace("removing triggerName from listening '%s' ", triggerName);
        }
        this.subsRefsMap[triggerName] = newRefs;
        delete this.subscriptionMap[subId];
        this.logger.trace("list of subscriptions still available '(%j)'", this.subscriptionMap);
    };
    AmqpPubSub.prototype.asyncIterator = function (triggers) {
        return new pubsub_async_iterator_1.PubSubAsyncIterator(this, triggers);
    };
    AmqpPubSub.prototype.onMessage = function (channel, message) {
        var _this = this;
        var subscribers = this.subsRefsMap[channel];
        if (!subscribers || !subscribers.length) {
            return;
        }
        this.logger.trace("sending message to subscriber callback function '(%j)'", message);
        async_1.each(subscribers, function (subId, cb) {
            var _a = _this.subscriptionMap[subId], triggerName = _a[0], listener = _a[1];
            listener(message);
            cb();
        });
    };
    return AmqpPubSub;
}());
exports.AmqpPubSub = AmqpPubSub;
//# sourceMappingURL=amqp-pubsub.js.map