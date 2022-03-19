# Kotlin for coc.nvim

> Fork from https://github.com/fwcd/vscode-kotlin

Smart code completion, linting, formatting and more for Kotlin in coc.nvim using the [Kotlin language server](https://github.com/fwcd/kotlin-language-server)

To use, make sure that JDK 11+ is installed and open a Kotlin file **inside a Gradle or Maven project**. Support for Kotlin source files with a standalone compiler (`kotlinc`) is experimental. The language server will then automatically launch in the background.

## Features

- Code completion
- Linting
- Go-to-definition
- Signature help
- Hover
- Formatting
- Document symbols
- Find references

## Usage

```
:CocInstall coc-kotlin
```

## Syntax highlight

Recommend to use https://github.com/udalov/kotlin-vim
