import React from "react";
import "./App.css";
import Plot from "react-plotly.js";

import { buildModels, extrapolateAndMix, Year } from "./models";

const x: Year[] = [];
for (let i = 0; i < 100; i++) {
  x.push(i + 2022);
}

const historyNoWork = extrapolateAndMix(
  2022,
  buildModels({ work: false }),
  100
);
const historyWork = extrapolateAndMix(2022, buildModels({ work: true }), 100);
const delta = historyWork.map(
  (ensemble, i) =>
    new Map(
      Array.from(ensemble.entries()).map(([k, v]) => [
        k,
        v - (historyNoWork[i].get(k) || 0),
      ])
    )
);

function App() {
  return (
    <div>
      <Plot
        data={[
          {
            x,
            y: historyNoWork.map((ensemble) => ensemble.get("heaven")!),
            name: "heaven",
            type: "bar",
          },
          {
            x,
            y: historyNoWork.map((ensemble) => ensemble.get("dead")!),
            name: "dead",
            type: "bar",
          },
          {
            x,
            y: historyNoWork.map((ensemble) =>
              Array.from(ensemble.entries())
                .filter(([w, _]) => typeof w === "number")
                .map(([_, p]) => p)
                .reduce((a, b) => a + b, 0)
            ),
            name: "normal",
            type: "bar",
          },
        ]}
        layout={{
          width: 1020,
          height: 720,
          title: "A Fancy Plot",
          barmode: "stack",
        }}
      />

      <br />

      <Plot
        data={[
          {
            x,
            y: delta.map((ensemble) => ensemble.get("heaven")!),
            name: "heaven",
            type: "bar",
          },
          {
            x,
            y: delta.map((ensemble) => ensemble.get("dead")!),
            name: "dead",
            type: "bar",
          },
          {
            x,
            y: delta.map((ensemble) =>
              Array.from(ensemble.entries())
                .filter(([w, _]) => typeof w === "number")
                .map(([_, p]) => p)
                .reduce((a, b) => a + b, 0)
            ),
            name: "normal",
            type: "bar",
          },
        ]}
        layout={{ width: 1020, height: 720, title: "Delta from working" }}
      />

      <br />
      <strong>
        Increased chance of heaven from working:{" "}
        {historyWork[historyWork.length - 1].get("heaven")! -
          historyNoWork[historyNoWork.length - 1].get("heaven")!}
      </strong>
    </div>
  );
}

export default App;
