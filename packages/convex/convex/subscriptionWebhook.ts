import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

const http = httpRouter();


http.route({
  path: "/subscription-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const sig = request.headers.get("stripe-signature");
      if (!sig) throw new Error("Falta la firma de Stripe");

      const buf = Buffer.from(await request.arrayBuffer());
      const event = stripe.webhooks.constructEvent(
        buf,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      console.log("✅ Evento Stripe recibido:", event.type);

      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutSessionCompleted(ctx, event.data.object);
          break;
        case "invoice.payment_succeeded":
          // await handleInvoicePaymentSucceeded(ctx, event.data.object);
          break;
        case "customer.subscription.deleted":
          // await handleSubscriptionDeleted(ctx, event.data.object);
          break;
        case "customer.subscription.updated":
          // await handleSubscriptionUpdated(ctx, event.data.object);
          break;
        default:
          console.log(`⚠️ Evento no manejado: ${event.type}`);
      }

      return new Response(null, { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }),
});

async function handleCheckoutSessionCompleted(ctx: any, session: Stripe.Checkout.Session) {
  console.log("✅ checkout.session.completed");

  const { customer, subscription, metadata } = session;
  if (!metadata?.schoolId || !metadata?.userId || !subscription) {
    throw new Error("Faltan datos necesarios en checkout session");
  }

  const subscriptionDetails = await stripe.subscriptions.retrieve(subscription as string);
  const plan = subscriptionDetails.items.data[0]?.price;
  console.log(session)
  await ctx.runMutation(internal.functions.schoolSubscriptions.saveSubscription, {
    schoolId: metadata.schoolId,
    userId: metadata.userId,
    stripeCustomerId: customer as string,
    stripeSubscriptionId: subscription as string,
    currency: plan?.currency || "usd",
    plan: plan?.id || "unknown",
    status: "trialing",
    currentPeriodStart: subscriptionDetails.created,
    currentPeriodEnd: session.expires_at,
  });
}

// async function handleInvoicePaymentSucceeded(ctx: any, invoice: Stripe.Invoice) {
//   if (!invoice.customer) throw new Error("Missing customer in invoice");

//   const subscriptions = await stripe.subscriptions.list({
//     customer: invoice.customer as string,
//     status: "active",
//     limit: 1,
//   });

//   if (subscriptions.data.length === 0) throw new Error("No active subscription found");

//   const subscription = subscriptions.data[0];

//   await ctx.runMutation(internal["functions/schoolSubscriptions"].updateSubscription, {
//     stripeSubscriptionId: subscription.id,
//     status: "active",
//     currency: invoice.currency,
//     plan: subscription.items.data[0]?.price.lookup_key || subscription.items.data[0]?.price.id || "unknown",
//     currentPeriodStart: subscription.current_period_start,
//     currentPeriodEnd: subscription.current_period_end,
//     stripeCustomerId: subscription.customer as string,
//     updatedAt: Math.floor(Date.now() / 1000),
//   });
// }

// async function handleSubscriptionDeleted(ctx: any, subscription: Stripe.Subscription) {
//   await ctx.runMutation(internal["functions/schoolSubscriptions"].updateSubscription, {
//     stripeSubscriptionId: subscription.id,
//     status: "canceled",
//     updatedAt: Math.floor(Date.now() / 1000),
//   });
// }

// async function handleSubscriptionUpdated(ctx: any, subscription: Stripe.Subscription) {
//   await ctx.runMutation(internal["functions/schoolSubscriptions"].updateSubscription, {
//     stripeSubscriptionId: subscription.id,
//     status: subscription.status,
//     updatedAt: Math.floor(Date.now() / 1000),
//   });
// }

export default http;
