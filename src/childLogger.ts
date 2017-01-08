import * as bunyan from 'bunyan';

export function createChildLogger(logger: bunyan.Logger, className: string) {
  return logger.child({ child: "amqp-pubsub", "class": className }, true);
}
