import React from "react";

import { roundPrecision } from "../modules/functions";

function ResultTable(props) {
  const { values, title } = props;

  if (!values) return null;
  const keys = Object.keys(values);

  return (
    <table>
      <tbody>
        {title && (
          <tr>
            <th colSpan={values[keys[0]].length}>{title}</th>
          </tr>
        )}

        {keys.map(k => (
          <tr key={k}>
            {values[k].map((cell, idx) => (
              <td key={cell + "-" + idx}>{roundPrecision(cell, 3)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ResultTable;
