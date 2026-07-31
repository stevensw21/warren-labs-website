import { ApiError, isPlainObject, requireString } from "./api";

const MAXIMUM_DEFINITION_BYTES = 256 * 1024;

export type SceneRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  definition_json: string;
  created_at: string;
  updated_at: string;
};

export type SceneRecord = {
  id: string;
  name: string;
  description: string;
  definition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function sceneFromRow(row: SceneRow): SceneRecord {
  let definition: unknown = {};
  try {
    definition = JSON.parse(row.definition_json);
  } catch {
    definition = {};
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    definition: isPlainObject(definition) ? definition : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function parseSceneInput(
  body: Record<string, unknown>,
  partial = false,
): {
  name?: string;
  description?: string;
  definitionJson?: string;
} {
  const result: {
    name?: string;
    description?: string;
    definitionJson?: string;
  } = {};

  if (!partial || Object.hasOwn(body, "name")) {
    result.name = requireString(body.name, "name", { maximum: 80 });
  }

  if (Object.hasOwn(body, "description")) {
    result.description = requireString(body.description, "description", {
      maximum: 500,
      allowEmpty: true,
    });
  } else if (!partial) {
    result.description = "";
  }

  if (Object.hasOwn(body, "definition")) {
    if (!isPlainObject(body.definition)) {
      throw new ApiError(
        400,
        "invalid_field",
        "definition must be a JSON object.",
        { field: "definition" },
      );
    }
    const encoded = JSON.stringify(body.definition);
    if (new TextEncoder().encode(encoded).byteLength > MAXIMUM_DEFINITION_BYTES) {
      throw new ApiError(
        413,
        "scene_too_large",
        "The scene contains too many tracks or settings to save.",
      );
    }
    result.definitionJson = encoded;
  } else if (!partial) {
    result.definitionJson = "{}";
  }

  if (partial && Object.keys(result).length === 0) {
    throw new ApiError(
      400,
      "no_changes",
      "Provide at least one scene field to update.",
    );
  }

  return result;
}

export function validateRecordId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,100}$/u.test(id)) {
    throw new ApiError(400, "invalid_id", "The requested record id is invalid.");
  }
  return id;
}
