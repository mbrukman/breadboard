/**
 * @fileoverview Searches weather information on Google Search.
 */

import { Template } from "../a2/template";
import { defaultLLMContent, err, ok, toLLMContent, toText } from "../a2/utils";
import getWeather, {
  describe as getWeatherDescriber,
  type WeatherInputs,
} from "./get-weather-tool";

export { invoke as default, describe };

/**
 * Every tool operates in one of three modes:
 * - `tool` -- when invoked as a tool by an LLM
 * - `step` -- when used as a step in a visual editor
 * - `invoke` -- when invoked directly as a module (by another module)
 */
export type ToolMode = "tool" | "step" | "invoke";

async function resolveInput(inputContent: LLMContent): Promise<string> {
  const template = new Template(inputContent);
  const substituting = await template.substitute({}, async () => "");
  if (!ok(substituting)) {
    return substituting.$error;
  }
  return toText(substituting);
}

export type Inputs =
  | {
      context?: LLMContent[];
      "p-location": LLMContent;
    }
  | WeatherInputs;

export type Outputs = {
  context: LLMContent[];
};

async function invoke(inputs: Inputs): Promise<Outcome<Outputs>> {
  let location;
  if ("context" in inputs) {
    const last = inputs.context?.at(-1);
    if (last) {
      location = toText(last);
    } else {
      return err("Please provide a location");
    }
  } else if ("p-location" in inputs) {
    location = await resolveInput(inputs["p-location"]);
  } else {
    location = inputs.location;
  }
  location = (location || "").trim();
  if (!location) {
    return err("Please provide a location");
  }
  console.log("Location: " + location);
  const weatherResult = await getWeather({ location });
  if (!ok(weatherResult)) {
    return weatherResult;
  }
  return {
    context: [
      toLLMContent(
        `Location: ${location}\n\n Weather information: ${toText(weatherResult)}`
      ),
    ],
  };
}

export type DescribeInputs = {
  inputs: Inputs;
  inputSchema: Schema;
  asType: boolean;
};

async function describe({ asType: _, ...inputs }: DescribeInputs) {
  const isTool = inputs && Object.keys(inputs).length === 1;
  if (isTool) {
    return getWeatherDescriber();
  }
  const hasWires = "context" in (inputs.inputSchema.properties || {});
  const location: Schema["properties"] = hasWires
    ? {}
    : {
        "p-location": {
          type: "object",
          title: "Location",
          description:
            "Please provide the location for which to get current weather",
          behavior: [
            "llm-content",
            "config",
            "hint-preview",
            "hint-single-line",
          ],
          default: defaultLLMContent(),
        },
      };
  return {
    title: "Get Weather",
    description: "Searches weather information on Google Search.",
    inputSchema: {
      type: "object",
      properties: {
        context: {
          type: "array",
          items: { type: "object", behavior: ["llm-content"] },
          title: "Context in",
          behavior: ["main-port"],
        },
        ...location,
      },
    } satisfies Schema,
    outputSchema: {
      type: "object",
      properties: {
        context: {
          type: "array",
          items: { type: "object", behavior: ["llm-content"] },
          title: "Context out",
          behavior: ["hint-text", "main-port"],
        },
      },
    } satisfies Schema,
    metadata: {
      icon: "sunny",
      tags: ["quick-access", "tool", "component"],
      order: 5,
    },
  };
}
