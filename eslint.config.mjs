import js from "@eslint/js";
import * as tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

const typescriptFiles = ["**/*.{ts,tsx,cts,mts}"];

export default [
    {
        ignores: ["node_modules", ".next", "out"],
    },
    js.configs.recommended,
    tseslint.configs.base,
    {
        files: typescriptFiles,
        languageOptions: {
            parser: tseslint.parser,
        },
        plugins: {
            "@typescript-eslint": tseslint.plugin,
        },
        rules: {
            "@typescript-eslint/array-type": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/consistent-type-definitions": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-misused-promises": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/prefer-optional-chain": "off",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/triple-slash-reference": "off",
        },
    },
    nextPlugin.configs.recommended,
    {
        plugins: {
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            "no-empty": "off",
            "no-undef": "off",
            "no-unreachable": "off",
            "no-unused-vars": "off",
            "no-useless-escape": "off",
            "@next/next/no-typos": "off",
            "react-hooks/rules-of-hooks": "warn",
            "react-hooks/exhaustive-deps": "off",
            "react-refresh/only-export-components": "off",
        },
    },
];
