// SPDX-License-Identifier: LGPL-2.1-or-later
import React from "react";
import { createRoot } from "react-dom/client";
import "cockpit-dark-theme";
import "patternfly/patternfly-6-cockpit.scss";
import { Application } from "./app.js";
import "./app.scss";
const mount = () => { createRoot(document.getElementById("app")!).render(<Application />) };
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
    mount();
}
