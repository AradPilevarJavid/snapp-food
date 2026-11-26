import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const contractPath = path.resolve("../api/openapi.json");
const generatedDirectory = path.resolve("src/api/generated");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const contractId = "snapfood-openapi";
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  code: { esm: true, source: true },
});

ajv.addSchema(contract, contractId);
ajv.addFormat(
  "date-time",
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
);

const validatorExports = {};
const declarations = [
  'import type { components } from "./schema";',
  "",
];
const responseSchemas = [
  "ManagerIncomingOrderRead",
  "MenuItemRead",
  "OrderRead",
  "RestaurantManagerRead",
  "RestaurantRead",
];

for (const schemaName of responseSchemas) {
  if (!(schemaName in contract.components.schemas)) {
    throw new Error(`OpenAPI contract is missing response schema ${schemaName}`);
  }
  const componentReference = `${contractId}#/components/schemas/${schemaName}`;
  const schemaId = `snapfood-${schemaName}`;
  const arraySchemaId = `${schemaId}-array`;
  const singleExport = `validate${schemaName}`;
  const arrayExport = `validate${schemaName}Array`;

  ajv.addSchema({ $id: schemaId, $ref: componentReference }, schemaId);
  ajv.addSchema(
    { $id: arraySchemaId, type: "array", items: { $ref: componentReference } },
    arraySchemaId,
  );
  validatorExports[singleExport] = schemaId;
  validatorExports[arrayExport] = arraySchemaId;
  declarations.push(
    `export declare const ${singleExport}: (data: unknown) => data is components["schemas"]["${schemaName}"];`,
    `export declare const ${arrayExport}: (data: unknown) => data is components["schemas"]["${schemaName}"][];`,
  );
}

fs.mkdirSync(generatedDirectory, { recursive: true });
fs.writeFileSync(
  path.join(generatedDirectory, "validators.js"),
  `${standaloneCode(ajv, validatorExports)}\n`,
);
fs.writeFileSync(
  path.join(generatedDirectory, "validators.d.ts"),
  `${declarations.join("\n")}\n`,
);
