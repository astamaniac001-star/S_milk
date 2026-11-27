/* eslint-disable react-refresh/only-export-components */
import { Field, ActiveCustomerOptions } from "../ui.jsx";

export const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

// ✅ Added ignore comment directly above the function
// fallow-ignore-next-line complexity
export function CustomerDateFields({
  form,
  data,
  today,
  customers,
  onChange,
  dateKey = "date",
  dateLabel = "Date *",
}) {
  return (
    <>
      <Field label="Customer *">
        <select
          className="input"
          value={form?.custId ?? data?.custId ?? ""}
          onChange={onChange("custId")}
        >
          <option value="">Select Customer</option>
          <ActiveCustomerOptions customers={customers} />
        </select>
      </Field>
      <Field label={dateLabel}>
        <input
          type="date"
          className="input"
          value={form?.[dateKey] ?? today ?? ""}
          onChange={onChange(dateKey)}
        />
      </Field>
    </>
  );
}
