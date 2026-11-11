import { describe, it, expect } from "vitest";
import {
  mapCustomerFromApi,
  mapCustomerToApi,
  mapSubscriptionFromApi,
  mapSubscriptionToApi,
  mapBrandFromApi,
  mapBrandToApi,
  mapLogFromApi,
  mapPaymentToApi,
} from "./mappers.js";

// Subscription-centric model: customers carry identity only. These tests
// pin the UI↔DB shape contract so a mapper change cannot silently reintroduce
// customer-level milk type / quantity / schedule (rule §4).

describe("mapCustomerFromApi — identity-only shape", () => {
  it("maps id/name/address/phone/status/balance/version", () => {
    const c = mapCustomerFromApi({
      id: "C1",
      name: "Ramesh",
      delivery_address: "Gate 1",
      phone: "9000000001",
      status: "Active",
      balance: 12.5,
      version: 3,
    });

    expect(c).toEqual({
      id: "C1",
      name: "Ramesh",
      address: "Gate 1",
      phone: "9000000001",
      status: "Active",
      balance: 12.5,
      version: 3,
    });
  });

  it("does NOT expose legacy product/qty/deliveryDays fields", () => {
    const c = mapCustomerFromApi({
      id: "C1",
      name: "Ramesh",
      delivery_address: "a",
      phone: "p",
      status: "Active",
      product: "Full Cream",
      daily_qty: 2,
      delivery_days: [0, 1, 2],
      version: 1,
    });

    expect(c.product).toBeUndefined();
    expect(c.qty).toBeUndefined();
    expect(c.deliveryDays).toBeUndefined();
  });
});

describe("mapCustomerToApi — identity-only payload", () => {
  it("sends only identity fields (+ id/version for OCC)", () => {
    const payload = mapCustomerToApi({
      id: "C1",
      version: 4,
      name: "Ramesh",
      address: "Gate 1",
      phone: "9000000001",
      status: "Active",
    });

    expect(payload).toEqual({
      customerId: "C1",
      expectedVersion: 4,
      name: "Ramesh",
      deliveryAddress: "Gate 1",
      phone: "9000000001",
      status: "Active",
    });
  });

  it("never writes product / dailyQty / deliveryDays", () => {
    const payload = mapCustomerToApi({
      name: "Ramesh",
      address: "a",
      phone: "p",
      product: "Toned",
      qty: 3,
      deliveryDays: [1, 2],
    });

    expect(payload.product).toBeUndefined();
    expect(payload.dailyQty).toBeUndefined();
    expect(payload.deliveryDays).toBeUndefined();
  });
});

describe("mapSubscriptionToApi — subscription payload", () => {
  it("carries brandId and defaults milkType to the canonical constant + isActive true", () => {
    const payload = mapSubscriptionToApi({
      customerId: "C1",
      brandId: "B1",
      qty: 2,
      deliveryDays: [1, 2, 3],
    });

    expect(payload).toEqual({
      customerId: "C1",
      brandId: "B1",
      milkType: "Full Cream",
      qty: 2,
      deliveryDays: [1, 2, 3],
      isActive: true,
    });
  });

  it("normalizes an empty brandId to null (legacy brandless rows)", () => {
    expect(
      mapSubscriptionToApi({ customerId: "C1", brandId: "" }).brandId,
    ).toBeNull();
    expect(mapSubscriptionToApi({ customerId: "C1" }).brandId).toBeNull();
  });

  it("coerces qty to a number", () => {
    expect(mapSubscriptionToApi({ customerId: "C1", qty: "2.5" }).qty).toBe(
      2.5,
    );
  });

  it("persists the modal's visible default (1L) when qty was never set", () => {
    // The SubscriptionModal renders qty 1 for an empty form — the mapper
    // must persist that same default instead of writing 0.
    expect(mapSubscriptionToApi({ customerId: "C1" }).qty).toBe(1);
  });

  it("keeps an explicit 0 so the API guard can reject it", () => {
    expect(mapSubscriptionToApi({ customerId: "C1", qty: 0 }).qty).toBe(0);
  });

  it("threads id + expectedVersion on the edit path (OCC)", () => {
    const payload = mapSubscriptionToApi({
      id: "S1",
      version: 7,
      customerId: "C1",
      milkType: "Toned",
      qty: 1,
      isActive: false,
    });

    expect(payload.id).toBe("S1");
    expect(payload.expectedVersion).toBe(7);
    expect(payload.isActive).toBe(false);
  });

  it("omits id/expectedVersion on the create path", () => {
    const payload = mapSubscriptionToApi({ customerId: "C1", qty: 1 });
    expect(payload.id).toBeUndefined();
    expect(payload.expectedVersion).toBeUndefined();
  });
});

describe("mapSubscriptionFromApi — DB→UI shape", () => {
  it("maps snake_case columns to camelCase UI fields", () => {
    const s = mapSubscriptionFromApi({
      id: "S1",
      customer_id: "C1",
      brand_id: "B1",
      milk_type: "Toned",
      qty: 2,
      delivery_days: [1, 2],
      is_active: true,
      version: 3,
    });

    expect(s).toEqual({
      id: "S1",
      customerId: "C1",
      brandId: "B1",
      milkType: "Toned",
      qty: 2,
      deliveryDays: [1, 2],
      isActive: true,
      version: 3,
    });
  });

  it("maps a NULL brand_id to null (legacy unbranded rows)", () => {
    const s = mapSubscriptionFromApi({
      id: "S1",
      customer_id: "C1",
      brand_id: null,
      milk_type: "Toned",
      delivery_days: "[0,1,2]",
      is_active: false,
    });
    expect(s.brandId).toBeNull();
    expect(s.deliveryDays).toEqual([0, 1, 2]);
    expect(s.isActive).toBe(false);
  });
});

describe("mapBrandFromApi / mapBrandToApi — brand + rates shape", () => {
  it("maps the FK-embedded brand_rates rows into sorted UI rates", () => {
    const b = mapBrandFromApi({
      id: "B1",
      brand_name: "Amul",
      status: "Active",
      supplier_name: "Amul Dairy",
      supplier_phone: "9000000001",
      default_milk_type: "Toned",
      rate_per_liter: 55,
      brand_rates: [
        { milk_type: "Full Cream", rate_per_liter: 60 },
        { milk_type: "Toned", rate_per_liter: 55 },
      ],
    });

    expect(b.rates).toEqual([
      { milkType: "Full Cream", rate: 60 },
      { milkType: "Toned", rate: 55 },
    ]);
    expect(b.defaultMilkType).toBe("Toned");
    expect(b.rate).toBe(55);
  });

  it("yields an empty rates array when the embed is absent (plain select)", () => {
    const b = mapBrandFromApi({ id: "B1", brand_name: "Amul" });
    expect(b.rates).toEqual([]);
  });

  it("builds a snake_case save_brand_rpc payload from the UI form", () => {
    const { brand, rates } = mapBrandToApi({
      id: "B1",
      name: "Amul",
      supplier: "Amul Dairy",
      phone: "9000000001",
      status: "Active",
      rates: [
        { milkType: "Full Cream", rate: 60 },
        { milkType: "", rate: 10 },
        { milkType: "Toned", rate: "55.5" },
      ],
    });

    expect(brand).toEqual({
      id: "B1",
      brand_name: "Amul",
      supplier_name: "Amul Dairy",
      supplier_phone: "9000000001",
      status: "Active",
    });
    // Blank-type rows are dropped; rates coerced to numbers.
    expect(rates).toEqual([
      { milk_type: "Full Cream", rate_per_liter: 60 },
      { milk_type: "Toned", rate_per_liter: 55.5 },
    ]);
  });

  it("defaults status to Active and omits id on the create path", () => {
    const { brand } = mapBrandToApi({ name: "Local" });
    expect(brand.id).toBeUndefined();
    expect(brand.status).toBe("Active");
  });
});

describe("mapLogFromApi — brand-aware log shape", () => {
  it("maps brand_id to brandId (null for legacy rows)", () => {
    expect(
      mapLogFromApi({
        id: "L1",
        customer_id: "C1",
        product: "Full Cream",
        brand_id: "B1",
      }).brandId,
    ).toBe("B1");
    expect(
      mapLogFromApi({
        id: "L1",
        customer_id: "C1",
        product: "Full Cream",
        brand_id: null,
      }).brandId,
    ).toBeNull();
    expect(
      mapLogFromApi({ id: "L1", customer_id: "C1", product: "Full Cream" })
        .brandId,
    ).toBeNull();
  });
});

describe("mapPaymentToApi — idempotency-key contract (AGENTS §14)", () => {
  it("THROWS when the caller forgets the idempotency key", () => {
    // A silent fallback `|| generateKey()` minted a fresh key per call and
    // defeated the DB uniqueness guard (double-charge window). The mapper
    // must fail loudly instead (audit 2026-11-09, F6).
    expect(() => mapPaymentToApi("BILL1", 100, { mode: "Cash" })).toThrow(
      /idempotencyKey/i,
    );
    expect(() => mapPaymentToApi("BILL1", 100, {})).toThrow(/idempotencyKey/i);
  });

  it("passes the caller-owned key through unchanged", () => {
    const out = mapPaymentToApi("BILL1", "100", {
      mode: "UPI",
      date: "2026-11-09",
      note: "ref#1",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
    expect(out).toEqual({
      billId: "BILL1",
      amount: 100,
      mode: "UPI",
      date: "2026-11-09",
      note: "ref#1",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("defaults mode to Cash and date to an IST YYYY-MM-DD", () => {
    const out = mapPaymentToApi("BILL1", 50, {
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
    expect(out.mode).toBe("Cash");
    expect(out.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
