import type { PaymentGateway, PaymentMethod } from "./provider";

export class MockGateway implements PaymentGateway {
  async createCheckout(input: {
    invoiceNumber: string;
    invoiceId: string;
    method: PaymentMethod;
    successUrl: string;
  }) {
    const origin = new URL(input.successUrl).origin;
    const url = new URL("/api/payments/webhook", origin);
    url.searchParams.set("invoice", input.invoiceId);
    url.searchParams.set("ref", `mock_${input.invoiceNumber}`);
    url.searchParams.set("method", input.method);
    return {
      redirectUrl: url.toString(),
      providerRef: `mock_${input.invoiceNumber}`,
    };
  }

  async parseWebhook() {
    return {
      providerRef: "",
      invoiceId: "",
      status: "ignored" as const,
      method: "unknown" as const,
    };
  }
}
