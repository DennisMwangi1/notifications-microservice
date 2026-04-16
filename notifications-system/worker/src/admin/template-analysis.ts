import * as handlebars from 'handlebars';

const BUILT_IN_HELPERS = new Set([
  'if',
  'unless',
  'each',
  'with',
  'lookup',
  'log',
]);

type JsonObject = Record<string, unknown>;

interface JsonPathCollections {
  availablePaths: string[];
  leafPaths: string[];
}

export interface TemplateVariableAnalysis {
  availableVariables: string[];
  referencedVariables: string[];
  missingVariables: string[];
  unusedVariables: string[];
  syntaxErrors: string[];
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function collectJsonPaths(value: JsonObject): JsonPathCollections {
  const availablePaths = new Set<string>();
  const leafPaths = new Set<string>();

  const walk = (currentValue: unknown, prefix = '') => {
    if (Array.isArray(currentValue)) {
      if (prefix) {
        availablePaths.add(prefix);
        if (currentValue.length === 0) {
          leafPaths.add(prefix);
        }
      }

      currentValue.forEach((item, index) => {
        const itemPath = prefix ? `${prefix}.${index}` : String(index);

        if (Array.isArray(item) || isJsonObject(item)) {
          walk(item, itemPath);
          return;
        }

        availablePaths.add(itemPath);
        leafPaths.add(itemPath);
      });

      return;
    }

    if (isJsonObject(currentValue)) {
      const entries = Object.entries(currentValue);

      if (prefix) {
        availablePaths.add(prefix);
        if (entries.length === 0) {
          leafPaths.add(prefix);
        }
      }

      entries.forEach(([key, item]) => {
        const itemPath = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(item) || isJsonObject(item)) {
          walk(item, itemPath);
          return;
        }

        availablePaths.add(itemPath);
        leafPaths.add(itemPath);
      });

      return;
    }

    if (prefix) {
      availablePaths.add(prefix);
      leafPaths.add(prefix);
    }
  };

  walk(value);

  return {
    availablePaths: Array.from(availablePaths).sort(),
    leafPaths: Array.from(leafPaths).sort(),
  };
}

export function collectHandlebarsVariablePaths(
  template: string,
  sourceLabel: 'template' | 'subject' = 'template',
): {
  paths: string[];
  syntaxErrors: string[];
} {
  if (!template.trim()) {
    return {
      paths: [],
      syntaxErrors: [],
    };
  }

  let ast: Record<string, unknown>;

  try {
    ast = handlebars.parse(template) as unknown as Record<string, unknown>;
  } catch (error) {
    return {
      paths: [],
      syntaxErrors: [
        `Handlebars syntax error in ${sourceLabel}: ${
          error instanceof Error
            ? error.message
            : 'Invalid Handlebars expression.'
        }`,
      ],
    };
  }

  const paths = new Set<string>();

  const addPath = (node: unknown) => {
    const pathNode = node as {
      type?: string;
      original?: string;
      depth?: number;
      data?: boolean;
    };

    if (pathNode?.type !== 'PathExpression') {
      return;
    }

    const original = pathNode.original?.trim();

    if (
      !original ||
      original === 'this' ||
      original.startsWith('@') ||
      pathNode.depth
    ) {
      return;
    }

    paths.add(original.replace(/\//g, '.'));
  };

  const visit = (node: unknown) => {
    if (!node) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const typedNode = node as {
      type?: string;
      body?: unknown[];
      path?: unknown;
      params?: unknown[];
      hash?: { pairs?: Array<{ value?: unknown }> };
      program?: unknown;
      inverse?: unknown;
      name?: unknown;
    };

    switch (typedNode.type) {
      case 'Program':
        visit(typedNode.body);
        return;
      case 'MustacheStatement': {
        const path = typedNode.path as { original?: string } | undefined;
        if (
          path?.original &&
          !BUILT_IN_HELPERS.has(path.original) &&
          !(typedNode.params?.length || typedNode.hash?.pairs?.length)
        ) {
          addPath(typedNode.path);
        }
        visit(typedNode.params);
        visit(typedNode.hash?.pairs?.map((pair) => pair.value));
        return;
      }
      case 'BlockStatement':
        visit(typedNode.params);
        visit(typedNode.hash?.pairs?.map((pair) => pair.value));
        visit(typedNode.program);
        visit(typedNode.inverse);
        return;
      case 'SubExpression':
        visit(typedNode.params);
        visit(typedNode.hash?.pairs?.map((pair) => pair.value));
        return;
      case 'PartialStatement':
      case 'PartialBlockStatement':
        visit(typedNode.params);
        visit(typedNode.hash?.pairs?.map((pair) => pair.value));
        visit(typedNode.program);
        visit(typedNode.inverse);
        return;
      case 'Hash':
        visit(typedNode.hash?.pairs?.map((pair) => pair.value));
        return;
      case 'PathExpression':
        addPath(typedNode);
        return;
      default:
        return;
    }
  };

  visit(ast);

  return {
    paths: Array.from(paths).sort(),
    syntaxErrors: [],
  };
}

export function analyzeTemplateVariables(
  template: string,
  sampleData: JsonObject,
  subjectLine?: string | null,
): TemplateVariableAnalysis {
  const availableVariables = collectJsonPaths(sampleData);
  const templateAnalysis = collectHandlebarsVariablePaths(template, 'template');
  const subjectAnalysis = subjectLine
    ? collectHandlebarsVariablePaths(subjectLine, 'subject')
    : { paths: [], syntaxErrors: [] };
  const referencedSet = new Set<string>([
    ...templateAnalysis.paths,
    ...subjectAnalysis.paths,
  ]);
  const referencedVariables = Array.from(referencedSet).sort();
  const availableSet = new Set(availableVariables.availablePaths);

  const missingVariables = referencedVariables.filter(
    (variablePath) => !availableSet.has(variablePath),
  );
  const unusedVariables = availableVariables.leafPaths.filter(
    (variablePath) =>
      !referencedVariables.some(
        (referencedVariable) =>
          variablePath === referencedVariable ||
          variablePath.startsWith(`${referencedVariable}.`),
      ),
  );

  return {
    availableVariables: availableVariables.availablePaths,
    referencedVariables,
    missingVariables,
    unusedVariables,
    syntaxErrors: [
      ...templateAnalysis.syntaxErrors,
      ...subjectAnalysis.syntaxErrors,
    ],
  };
}
