const asyncAuto = require('async/auto');
const {getChannels} = require('ln-service');
const {getNodeAlias} = require('ln-sync');
const {returnResult} = require('asyncjs-util');
const {subscribeToPastPayment} = require('ln-service');

const {isArray} = Array;

/** Get a rebalance message

  {
    fee: <Payment Fee Tokens Number>
    hops: [{
      public_key: <Forwarding Node Public Key Hex String>
    }]
    lnd: <Authenticated LND API Object>
    payments: [{
      in_channel: <Incoming Payment Through Channel Id String>
    }]
    received: <Received Tokens Number>
  }

  @returns via cbk or Promise
  {
    message: <Rebalance Message String>
  }
*/
module.exports = ({fee, hops, lnd, payments, received}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (fee === undefined) {
          return cbk([400, 'ExpectedPaidFeeToGetRebalanceMessage']);
        }

        if (!isArray(hops)) {
          return cbk([400, 'ExpectedArrayOfHopsToGetRebalanceMessage']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToGetRebalanceMessage']);
        }

        if (!isArray(payments)) {
          return cbk([400, 'ExpectedPaymentsToGetRebalanceMessage']);
        }

        if (received === undefined) {
          return cbk([400, 'ExpectedReceivedAmountToGetRebalanceMessage']);
        }

        return cbk();
      },

      // Get channels to figure out who the inbound peer is
      getChannels: ['validate', ({}, cbk) => {
        const [inPayment] = payments;

        if (!inPayment) {
          return cbk();
        }

        return getChannels({lnd}, cbk);
      }],

      // Get outbound peer alias
      getOut: ['validate', ({}, cbk) => {
        const [firstHop] = hops;

        if (!firstHop) {
          return cbk(null, {});
        }

        return getNodeAlias({lnd, id: firstHop.public_key}, cbk);
      }],

      // Get inbound peer alias
      getIn: ['getChannels', ({getChannels}, cbk) => {
        const [inPayment] = payments;

        if (!inPayment) {
          return cbk();
        }

        // Figure out who the channel is with
        const {channels} = getChannels;

        const inChannel = channels.find(n => n.id === inPayment.in_channel);

        // Exit early when the inbound channel is unknown
        if (!inChannel) {
          return cbk();
        }

        return getNodeAlias({lnd, id: inChannel.partner_public_key}, cbk);
      }],

      // Derive a description of the rebalance
      rebalanceDescription: ['getIn', 'getOut', ({getIn, getOut}, cbk) => {
        const withNode = `with ${getOut.alias || getOut.id || 'peer'}`;

        const increase = `Increased inbound ${withNode}`;

        const rebalance = `${increase} by ${received}. Paid fee: ${fee}`;

        // Exit early when there is no inbound peer info
        if (!getIn) {
          return cbk(null, rebalance);
        }

        const decrease = `Decreased inbound with ${getIn.alias || getIn.id}`;

        return cbk(null, `${rebalance}. ${decrease}`);
      }],

      // Final message result
      message: ['rebalanceDescription', ({rebalanceDescription}, cbk) => {
        return cbk(null, {message: rebalanceDescription});
      }],
    },
    returnResult({reject, resolve, of: 'message'}, cbk));
  });
};
