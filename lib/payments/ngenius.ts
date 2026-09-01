import type { PaymentGateway, PaymentMethod } from "./provider";

/**
 * Network International N-Genius Online.
 * Tabby and Tamara are enabled on the N-Genius outlet (native BNPL),
 * then selected here via the payment method so both BNPL rails share one integration.
 * Docs: https://docs.ngenius-payments.com
 */
export class NGeniusGateway implements PaymentGateway {
  private base() {
    return (
      process.env.NGENIUS_API_BASE ??
      "https://api-gateway.sandbox.ngenius-payments.com"
    );
  }

  private async accessToken() {
    const key = process.env.NGENIUS_API_KEY;
    if (!key) throw new Error("NGENIUS_API_KEY missing");
    const res = await fetch(`${this.base()}/identity/auth/access-token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${key}`,
        "Content-Type": "application/vnd.ni-identity.v1+json",
      },
    });
    if (!res.ok) throw new Error(`N-Genius auth failed (${res.status})`);
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  async createCheckout(input: {
    amountAed: number;
    invoiceNumber: string;
    invoiceId: string;
    method: PaymentMethod;
    customerEmail: string;
    customerName: string;
    successUrl: string;
    cancelUrl: string;
  }) {
    const token = await this.accessToken();
    const outlet = process.env.NGENIUS_OUTLET_ID;
    if (!outlet) throw new Error("NGENIUS_OUTLET_ID missing");

    const paymentMethodMap: Record<PaymentMethod, string | undefined> = {
      card: undefined,
      tabby: "TABBY",
      tamara: "TAMARA",
    };

    const res = await fetch(
      `${this.base()}/transactions/outlets/${outlet}/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/vnd.ni-payment.v2+json",
          Accept: "application/vnd.ni-payment.v2+json",
        },
        body: JSON.stringify({
          action: "SALE",
          amount: {
            currencyCode: "AED",
            value: Math.round(input.amountAed * 100),
          },
          merchantAttributes: {
            redirectUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
            skipConfirmationPage: true,
          },
          emailAddress: input.customerEmail,
          billingAddress: { firstName: input.customerName },
          merchantOrderReference: input.invoiceNumber,
          merchantDefinedData: { invoiceId: input.invoiceId },
          paymentMethod: paymentMethodMap[input.method],
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`N-Genius order failed: ${text}`);
    }

    const json = (await res.json()) as {
      reference: string;
      _links?: { payment?: { href: string } };
    };
    const redirectUrl = json._links?.payment?.href;
    if (!redirectUrl) throw new Error("N-Genius did not return a payment URL");
    return { redirectUrl, providerRef: json.reference };
  }

  async parseWebhook(rawBody: string, headers: Headers) {
    const secret = process.env.NGENIUS_WEBHOOK_SECRET;
    if (secret) {
      const header = headers.get("x-ngenius-webhook-secret");
      if (header !== secret) {
        throw new Error("Invalid N-Genius webhook secret");
      }
    }
    const json = JSON.parse(rawBody) as {
      eventName?: string;
      order?: {
        reference?: string;
        merchantDefinedData?: { invoiceId?: string };
        _embedded?: { payment?: Array<{ paymentMethod?: { name?: string } }> };
      };
    };
    const paid = (json.eventName ?? "").toUpperCase().includes("CAPTURED");
    const methodName =
      json.order?._embedded?.payment?.[0]?.paymentMethod?.name?.toLowerCase() ??
      "";
    const method: PaymentMethod | "unknown" = methodName.includes("tabby")
      ? "tabby"
      : methodName.includes("tamara")
        ? "tamara"
        : methodName
          ? "card"
          : "unknown";

    return {
      providerRef: json.order?.reference ?? "",
      invoiceId: json.order?.merchantDefinedData?.invoiceId ?? "",
      status: paid ? ("paid" as const) : ("ignored" as const),
      method,
    };
  }
}
