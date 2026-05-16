"use client";

import {
  ERPDynamicModalForm,
  type ERPDynamicModalVariant,
} from "@/components/design-system";

const modalVariants: ERPDynamicModalVariant[] = [
  {
    key: "employee",
    cardTitle: "Employee Management",
    cardDescription: "Add and manage employee records.",
    cardButtonLabel: "Add Employee",
    modalTitle: "Add New Employee",
    modalDescription: "Enter employee details to add to the system.",
    submitLabel: "Add Employee",
    accent: "blue",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path
          d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    fields: [
      {
        name: "employeeId",
        label: "Employee ID",
        required: true,
        placeholder: "EMP001",
        validation: {
          pattern: "^EMP\\d{3,}$",
          patternMessage: "Employee ID must look like EMP001.",
        },
      },
      {
        name: "fullName",
        label: "Full Name",
        required: true,
        placeholder: "John Smith",
        validation: {
          minLength: 3,
        },
      },
      {
        name: "department",
        label: "Department",
        type: "select",
        required: true,
        options: [
          { value: "hr", label: "Human Resources" },
          { value: "it", label: "Information Technology" },
          { value: "finance", label: "Finance" },
          { value: "sales", label: "Sales" },
          { value: "operations", label: "Operations" },
        ],
      },
      {
        name: "position",
        label: "Position",
        required: true,
        placeholder: "Senior Developer",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        placeholder: "john.smith@company.com",
        autoComplete: "email",
      },
      {
        name: "phone",
        label: "Phone",
        type: "tel",
        required: true,
        placeholder: "+1 (555) 000-0000",
        validation: {
          pattern: "^[+0-9()\\-\\s]{8,}$",
          patternMessage: "Enter a valid phone number.",
        },
      },
      {
        name: "startDate",
        label: "Start Date",
        type: "date",
        required: true,
        colSpan: 2,
      },
    ],
  },
  {
    key: "project",
    cardTitle: "Project Tracking",
    cardDescription: "Create and monitor project progress.",
    cardButtonLabel: "New Project",
    modalTitle: "Create New Project",
    modalDescription: "Set up project scope, timeline, and budget.",
    submitLabel: "Create Project",
    accent: "emerald",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path
          d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m-6 0a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    fields: [
      {
        name: "projectName",
        label: "Project Name",
        required: true,
        placeholder: "Website Redesign",
      },
      {
        name: "projectCode",
        label: "Project Code",
        required: true,
        placeholder: "PRJ-2026-001",
        validation: {
          pattern: "^PRJ-\\d{4}-\\d{3,}$",
          patternMessage: "Project code must look like PRJ-2026-001.",
        },
      },
      {
        name: "client",
        label: "Client",
        required: true,
        placeholder: "Acme Corporation",
        colSpan: 2,
      },
      {
        name: "budget",
        label: "Budget (USD)",
        type: "number",
        required: true,
        placeholder: "50000",
        min: 0,
        step: 0.01,
        validation: {
          minMessage: "Budget cannot be negative.",
        },
      },
      {
        name: "deadline",
        label: "Deadline",
        type: "date",
        required: true,
      },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        required: true,
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "critical", label: "Critical" },
        ],
        colSpan: 2,
      },
    ],
  },
  {
    key: "inventory",
    cardTitle: "Inventory Control",
    cardDescription: "Track stock and manage supplies.",
    cardButtonLabel: "Add Item",
    modalTitle: "Add Inventory Item",
    modalDescription: "Register a new item in your inventory catalog.",
    submitLabel: "Add to Inventory",
    accent: "amber",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
        <path
          d="m20 7-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    fields: [
      {
        name: "itemName",
        label: "Item Name",
        required: true,
        placeholder: "Office Chair",
      },
      {
        name: "sku",
        label: "SKU",
        required: true,
        placeholder: "SKU-12345",
      },
      {
        name: "category",
        label: "Category",
        type: "select",
        required: true,
        options: [
          { value: "furniture", label: "Furniture" },
          { value: "electronics", label: "Electronics" },
          { value: "supplies", label: "Office Supplies" },
          { value: "equipment", label: "Equipment" },
          { value: "raw", label: "Raw Materials" },
        ],
        colSpan: 2,
      },
      {
        name: "quantity",
        label: "Quantity",
        type: "number",
        required: true,
        min: 0,
        step: 1,
        placeholder: "100",
        validation: {
          minMessage: "Quantity must be 0 or greater.",
        },
      },
      {
        name: "unitPrice",
        label: "Unit Price (USD)",
        type: "number",
        required: true,
        min: 0,
        step: 0.01,
        placeholder: "29.99",
      },
      {
        name: "supplier",
        label: "Supplier",
        required: true,
        placeholder: "Global Supplies Inc.",
        colSpan: 2,
      },
    ],
  },
];

export default function ModalFormShowcase() {
  return (
    <ERPDynamicModalForm
      title="Dynamic Modal Form Component"
      description="This component is schema-driven. Change fields/variants in config and it renders new forms without code duplication."
      variants={modalVariants}
      onSubmit={({ variantKey, values }) => {
        // Replace this with API integration in your application.
        console.log("Dynamic form submit", variantKey, values);
        window.alert(`${variantKey.toUpperCase()} form submitted successfully.`);
      }}
    />
  );
}
