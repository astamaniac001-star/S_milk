import { useMemo, useCallback } from "react";
import { mapCustomerToApi, mapCustomerFromApi } from "../../lib/api.js";
import { validateCustomerForm } from "../../lib/validation.js";
import { useHelpers } from "./shared.js";

export function useCustomerHandlers(state) {
  const { setCustomers } = state;
  const { handleFormAction, saveWithValidation, executeApiAction } = useHelpers(state);


  const customerHandlers = useMemo(
    () => ({
      addCustomer: async (formArg) =>
        handleFormAction(
          "addCustomer",
          formArg,
          "Customer added",
          mapCustomerToApi,
          "getCustomers",
          setCustomers,
          mapCustomerFromApi,
          "customers",
        ),
      updateCustomer: async (formArg) =>
        handleFormAction(
          "updateCustomer",
          formArg,
          "Customer updated",
          mapCustomerToApi,
          "getCustomers",
          setCustomers,
          mapCustomerFromApi,
          "customers",
        ),
      deactivateCustomer: async (customer) => {
        if (!window.confirm(`Deactivate ${customer.name}?`)) return;
        await executeApiAction(
          "deactivateCustomer",
          { id: customer.id, version: customer.version },
          "Customer deactivated",
          "getCustomers",
          setCustomers,
          mapCustomerFromApi,
          "customers"
        );
      },
    }),
    [setCustomers, handleFormAction, executeApiAction],
  );

  const saveCustomer = useCallback(
    (formArg) =>
      saveWithValidation(
        formArg,
        validateCustomerForm,
        customerHandlers,
        "Customer",
      ),
    [saveWithValidation, customerHandlers],
  );

  return { ...customerHandlers, saveCustomer };
}
