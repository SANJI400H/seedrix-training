import "server-only";

export type PaymentMethod = "card" | "tabby" | "tamara";

export type CheckoutSession = {
  redirectUrl: string;
  providerRef: string;
};

export interface PaymentGateway {
  createCheckout(input: {
    amountAed: number;
    invoiceNumber: string;
    invoiceId: string;
    method: PaymentMethod;
    customerEmail: string;
    customerName: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;
  parseWebhook(rawBody: string, headers: Headers): Promise<{
    providerRef: string;
    invoiceId: string;
    status: "paid" | "failed" | "ignored";
    method: PaymentMethod | "unknown";
  }>;
}

export function getPaymentGateway(): PaymentGateway {
  const provider = process.env.PAYMENT_PROVIDER ?? "mock";
  if (provider === "ngenius") {
    // Loaded lazily so mock mode does not require credentials.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NGeniusGateway } = require("./ngenius") as typeof import("./ngenius");
    return new NGeniusGateway();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MockGateway } = require("./mock") as typeof import("./mock");
  return new MockGateway();
}
