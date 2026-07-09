# Demo page chunks

demo/index.html is assembled by GitHub Pages (Jekyll include_relative) from the cNN.html chunk files in this folder, in filename order. This exists because Otis's deploy pipe has a 20KB-per-call limit and the demo is a single ~130KB HTML file.

To update the demo: replace the chunk files (keep the include list in demo/index.html in sync) or restore a plain single-file index.html if a full-size push becomes possible. Source of truth lives in Otis's workspace: haf-knect/demo/index.html.
