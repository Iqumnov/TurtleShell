import Lake
open Lake DSL

package turtleshell_formal where
  srcDir := "."

@[default_target]
lean_lib TurtleShellProofs where
  roots := #[`TurtleShellProofs]

