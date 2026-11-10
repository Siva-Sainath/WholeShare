import React from "react";
import { createRoot } from "react-dom/client";
import { ModuleRegistry } from "ag-grid-community";
import { AllEnterpriseModule, IntegratedChartsModule } from "ag-grid-enterprise";
import { AgChartsEnterpriseModule } from "ag-charts-enterprise";
import { AgStudioModuleRegistry, AgStudioAiModule } from "ag-studio";
import { initAgGridLicense } from "./agGridLicense";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { App } from "./App";
import { installWebMcp } from "./webmcp";
import { installGridTools } from "./gridWebMcp";

initAgGridLicense();
ModuleRegistry.registerModules([AllEnterpriseModule, IntegratedChartsModule.with(AgChartsEnterpriseModule)]);
AgStudioModuleRegistry.registerModules([AgStudioAiModule]);
installWebMcp();
installGridTools();

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <Theme theme={neutralTheme} mode="light">
      <App />
    </Theme>
  );
} else {
  console.error("Failed to find #root element in document.");
}

