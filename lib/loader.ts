// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.

import type { LoadResponse } from "./types.d.ts";

const hasPermissions = "permissions" in Deno;
let readRequested = false;
const netRequested = new Set<string>();

async function requestRead(): Promise<void> {
  if (readRequested || !hasPermissions) {
    return;
  }
  readRequested = true;
  await Deno.permissions.request({ name: "read" });
}

async function requestNet(host: string): Promise<void> {
  if (!hasPermissions || netRequested.has(host)) {
    return;
  }
  netRequested.add(host);
  await Deno.permissions.request({ name: "net", host });
}

/** A Deno specific loader function that can be passed to the
 * `createModuleGraph` which will use `Deno.readTextFile` for local files, or
 * use `fetch()` for remote modules.
 *
 * @param specifier The string module specifier from the module graph.
 */
export async function load(
  specifier: string,
): Promise<LoadResponse | undefined> {
  const url = new URL(specifier);
  try {
    switch (url.protocol) {
      case "file:": {
        await requestRead();
        const content = await Deno.readTextFile(url);
        return {
          specifier,
          content,
        };
      }
      case "http:":
      case "https:": {
        await requestNet(url.host);
        const response = await fetch(url, { redirect: "follow" });
        if (response.status !== 200) {
          return undefined;
        }
        const content = await response.text();
        const headers: Record<string, string> = {};
        for (const [key, value] of response.headers) {
          headers[key.toLowerCase()] = value;
        }
        return {
          specifier: response.url,
          headers,
          content,
        };
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}