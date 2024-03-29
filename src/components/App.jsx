import React from "react";

import {
  calculateDilutionFactor,
  calculateDilutionSeries,
  roundPrecision,
  timeModifier,
  calclateWashResidueFromTimestamps,
  timestampToMins,
  calculateConcentrationFactor,
  calculateBoundAntibody,
  washModifier,
  calculateVariance
} from "../modules/functions";

import SampleSelect from "./SampleSelect";
import ResultTable from "./ResultTable";

class App extends React.Component {
  constructor(props) {
    super(props);
    this.samples = props.samples;
    this.plates = this.props.plates || Object.keys(props.samples[0].plates);
    this.logRef = null;
    this.variancePercent = 4;

    this.waveLengths = this.props.waveLengths || {};
    this.secondaryAntibodies = this.props.secondaryAntibodies || {};

    this.state = {
      primaryEfficiencyFactor: 1.0,
      dilutionFactor: null,
      inputVolume: 100,
      plate: null,
      assay: {
        a: [],
        b: [],
        c: [],
        d: [],
        e: [],
        f: [],
        g: [],
        h: []
      },
      selectedSamples: {
        a: null,
        b: null,
        c: null,
        d: null,
        e: null,
        f: null,
        g: null,
        h: null
      },
      timer: null,
      waitOn: false,
      washOn: false,
      timerStamp: null,
      displayStamp: null,
      log: [],
      dilutionResults: null,
      primaryResults: null,
      primaryWashResidue: 1,
      secondaryResults: null,
      phase: "primaryExposure",
      secondaryAntibody: null,
      secondaryConcentration: null,
      secondaryInputVolume: null,
      phases: {
        primaryExposure: null,
        primaryWash: null,
        secondaryExposure: null,
        secondaryWash: null
      }
    };
  }

  componentDidMount() {
    const {
      plate,
      selectedSamples,
      primaryEfficiencyFactor: pef,
      dilutionFactor: df,
      assay
    } = this.state;

    const dilutionFactor = calculateDilutionFactor(this.state.inputVolume);
    const dilutionResults = this.genAssayDilutions(
      plate,
      selectedSamples,
      df,
      pef
    );

    const newAssay = this.getAssayCalculations(
      assay,
      plate,
      selectedSamples,
      df,
      pef
    );

    this.setState({
      assay: newAssay,
      dilutionFactor,
      dilutionResults,
      primaryResults: { ...dilutionResults },
      secondaryResults: { ...dilutionResults }
    });
  }

  getAssayCalculations() {
    const {
      assay,
      plate,
      phase,
      phases,
      secondaryAntibody,
      secondaryConcentration,
      //primaryWashResidue = this.state.primaryWashResidue,
      selectedSamples,
      primaryEfficiencyFactor = this.state.primaryEfficiencyFactor
    } = this.state;
    const result = { ...assay };
    const dilutionFactor = calculateDilutionFactor(this.state.inputVolume);
    const primaryWashResidue = calclateWashResidueFromTimestamps(
      phases["primaryWash"] || []
    );
    const binding = secondaryAntibody ? secondaryAntibody.binding : 0;
    const efficiency = secondaryAntibody ? secondaryAntibody.efficiency : 0;
    const plates = secondaryAntibody ? secondaryAntibody.plates : [];

    let antibodyEff = 0;

    if (secondaryAntibody) {
      // if secondary antibody has specific plates defined
      // set to zero if plate in state is invalid
      if (secondaryAntibody && plates && plates.length > 0) {
        antibodyEff = plates.includes(plate) ? efficiency : 0;
      }
    }

    // calc dilutions
    Object.keys(selectedSamples).map(key => {
      let series = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      if (selectedSamples[key] && plate && dilutionFactor) {
        const value = selectedSamples[key].plates[plate] / 10;
        series = calculateDilutionSeries(
          value,
          dilutionFactor,
          primaryEfficiencyFactor
        );
      }

      // loop over series
      result[key] = series.map(i => {
        const dilution = i;
        const primary = timeModifier(i, phases["primaryExposure"]);

        if (!secondaryAntibody && phase !== "secondaryExposure") {
          return { dilution, primary, secondary: 0 };
        }

        let secondary = calculateBoundAntibody(
          primary,
          secondaryConcentration,
          antibodyEff,
          binding
        );
        secondary = timeModifier(secondary, phases["secondaryExposure"]);
        secondary = washModifier(secondary, primaryWashResidue, binding);
        // secondary =
        //   secondary + calculateVariance(secondary, this.variancePercent);
        return {
          dilution,
          primary,
          secondary
        };
      });
      return null;
    });

    console.log(result);

    return result;
  }

  logStep(step) {
    const { log } = this.state;
    const message = {
      default: ``,
      wash: `Washed for ${timestampToMins(step.displayStamp)} minutes.`,
      wait: `Waited ${timestampToMins(step.displayStamp)} minutes.`,
      acid: `Acid applied.`
    }[step.action || "default"];
    log.push({ ...step, action: step.action, message });
    this.setState({ log }, () => {
      this.logRef.scrollTop = this.logRef.scrollHeight;
    });
  }

  handleExposureOverTime(exposureType) {
    const {
      timerStamp,
      displayStamp,
      phases,
      phase,
      primaryWashResidue
    } = this.state;
    const start = +new Date();
    const onType = exposureType + "On";
    const isOn = this.state[onType];
    let wr = primaryWashResidue;

    if (isOn) {
      this.logStep({ action: exposureType, timerStamp, displayStamp });

      if (exposureType === "wash") {
        phases[phase].push(0);
        wr = calclateWashResidueFromTimestamps(phases[phase]);
      }

      return this.setState({
        timer: clearInterval(this.state.timer),
        [onType]: false,
        displayStamp: null,
        phases,
        primaryWashResidue: wr
        //assay: this.setAssayDilutions({ primaryWashResidue: wr })
      });
    }

    this.setState({
      start,
      timer: setInterval(this[exposureType].bind(this), 150),
      [exposureType + "On"]: true,
      displayStamp: null
    });
  }

  wait() {
    const {
      timerStamp,
      displayStamp,
      phase,
      phases,
      dilutionResults,
      primaryResults,
      secondaryResults,
      secondaryConcentration
    } = this.state;
    const stamp = timerStamp + 20 * 1000;
    const display = displayStamp + 20 * 1000;

    let prime = null;
    if (phase === "primaryExposure" && phases[phase] !== null) {
      prime = this.modifyAssayByTime(dilutionResults, phases[phase]);
    }

    let second = null;
    if (phase === "secondaryExposure" && phases[phase] !== null) {
      second = this.secondAntibodyBinding(secondaryConcentration);
      second = this.modifyAssayByTime(second, phases[phase]);
      second = this.modifyAssayByWash(second);
    }

    this.getAssayCalculations();

    this.setState({
      timerStamp: stamp,
      displayStamp: display,
      phases: {
        ...phases,
        [phase]: stamp
      },
      primaryResults: prime || primaryResults,
      secondaryResults: second || secondaryResults
    });
  }

  wash() {
    const { timerStamp, displayStamp, phases } = this.state;
    const stamp = timerStamp + 20 * 1000;
    const display = displayStamp + 20 * 1000;

    const washPhase = "primaryWash"; // need to programatically determine this
    const primaryWash = phases.primaryWash || [0];
    primaryWash[primaryWash.length - 1] = displayStamp;

    this.setState({
      timerStamp: stamp,
      displayStamp: display,
      phase: washPhase,
      phases: {
        ...phases,
        [washPhase]: primaryWash
      }
    });
  }

  modifyAssayByTime(assay, timestamp) {
    const results = { ...assay };
    Object.keys(results).map(i => {
      const cell = results[i].map(c => timeModifier(c, timestamp));
      return (results[i] = cell);
    });
    return results;
  }

  modifyAssayByWash(assay) {
    const { primaryWashResidue: wr, secondaryAntibody } = this.state;
    const { binding } = secondaryAntibody;

    const results = { ...assay };
    Object.keys(results).map(i => {
      const washedRow = results[i].map(c => washModifier(c, wr, binding));
      const variantRow = washedRow.map(
        c => c //+ calculateVariance(c, this.variancePercent)
      ); // adds random variation
      return (results[i] = variantRow);
    });
    return results;
  }

  genAssayDilutions(
    plate,
    selectedSamples = {},
    dilutionFactor,
    primaryEfficiencyFactor
  ) {
    const results = {};
    Object.keys(selectedSamples).map(i => {
      if (selectedSamples[i] && plate && dilutionFactor) {
        const value = selectedSamples[i].plates[plate] / 10;
        return (results[i] = calculateDilutionSeries(
          value,
          dilutionFactor,
          primaryEfficiencyFactor
        ));
      }
      return (results[i] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    });

    return results;
  }

  handleSelectPlate(e) {
    const {
      selectedSamples,
      primaryEfficiencyFactor: pef,
      dilutionFactor: df
    } = this.state;

    const plate = e.target.value;
    const dilutionResults = this.genAssayDilutions(
      plate,
      selectedSamples,
      df,
      pef
    );
    this.setState({ plate, dilutionResults });
  }

  handleChangePrimeEfficiency(e) {
    const { plate, selectedSamples: samples, dilutionFactor: df } = this.state;

    const primaryEfficiencyFactor = +e.target.value;
    const dilutionResults = this.genAssayDilutions(
      plate,
      samples,
      df,
      primaryEfficiencyFactor
    );
    this.setState({ dilutionResults, primaryEfficiencyFactor });
  }

  handleSelectSample(key, subject) {
    const {
      plate,
      selectedSamples,
      primaryEfficiencyFactor: pef,
      dilutionFactor: df
    } = this.state;

    const sample = this.samples.find(
      i => i.subject.toString() === subject.toString()
    );
    const samples = { ...selectedSamples, [key]: sample };
    const dilutionResults = this.genAssayDilutions(plate, samples, df, pef);
    this.setState({ selectedSamples: samples, dilutionResults });
  }

  handleDilutionVolume(e) {
    const {
      plate,
      selectedSamples: samples,
      primaryEfficiencyFactor: pef
    } = this.state;
    const dilutionFactor = calculateDilutionFactor(+e.target.value);
    const dilutionResults = this.genAssayDilutions(
      plate,
      samples,
      dilutionFactor,
      pef
    );
    this.setState({
      inputVolume: +e.target.value,
      dilutionFactor,
      dilutionResults
    });
  }

  secondAntibodyBinding(concentration) {
    const { secondaryAntibody, primaryResults, plate } = this.state;
    const { efficiency, binding, plates } = secondaryAntibody;
    let eff = efficiency;

    // if secondary antibody has specific plates defined
    // set to zero if plate in state is invalid
    if (plates && plates.length > 0) {
      eff = plates.includes(plate) ? efficiency : 0;
      console.warn("invalid plate, setting efficiency to 0");
    }

    const initialResults = {};
    Object.keys(primaryResults).map(i => {
      initialResults[i] = [];
      primaryResults[i].map((v, idx) => {
        let ab = calculateBoundAntibody(v, concentration, eff, binding);
        return (initialResults[i][idx] = ab);
      });
      return undefined;
    });
    return initialResults;
  }

  handleABConcentration(e) {
    const { secondaryAntibody } = this.state;
    const { microPerMil } = secondaryAntibody;
    // sets up initial ab concentration
    const concentration = calculateConcentrationFactor(
      +e.target.value,
      microPerMil
    );
    const initialResults = this.secondAntibodyBinding(concentration);
    const results = this.modifyAssayByWash(initialResults);
    this.setState({
      secondaryConcentration: concentration,
      secondaryResults: results
    });
  }

  handleSelectSecondaryAB(key) {
    this.setState({
      phase: "secondaryExposure",
      secondaryAntibody: this.secondaryAntibodies[key]
    });
  }

  render() {
    const { plates, samples } = this;
    const {
      plate,
      selectedSamples,
      dilutionFactor,
      waitOn,
      washOn,
      displayStamp,
      log,
      dilutionResults,
      primaryResults,
      primaryWashResidue,
      phases,
      secondaryAntibody,
      secondaryResults
    } = this.state;
    const sampleKeys = Object.keys(selectedSamples);

    const secondAntibodies = this.secondaryAntibodies;

    return (
      <div className="app-container">
        <fieldset>
          <legend>Developer Constants</legend>
          <label>
            Primary Efficiency Factor{" "}
            <input
              type="text"
              defaultValue={this.state.primaryEfficiencyFactor}
              onInput={e => this.handleChangePrimeEfficiency(e)}
            />
          </label>

          <div>variant percentage: {this.variancePercent}%</div>
        </fieldset>

        <div>
          <button
            // disabled={acidApplied}
            aria-pressed={waitOn}
            onClick={({ nativeEvent }) => this.handleExposureOverTime("wait")}
          >
            {waitOn ? "Wait Stop" : "Wait Start"}
          </button>

          <button
            // disabled={acidApplied}
            aria-pressed={washOn}
            onClick={({ nativeEvent }) => this.handleExposureOverTime("wash")}
          >
            {washOn ? "Wash Stop" : "Wash Start"}
          </button>

          <span>{timestampToMins(displayStamp)} mins</span>
        </div>

        <div style={{ maxWidth: "50%" }}>
          <fieldset>
            <legend>Step 1: Select Patients</legend>
            {sampleKeys.map(i => (
              <div key={i}>
                Select Patient {i.toLocaleUpperCase()}{" "}
                <SampleSelect
                  sampleKey={i}
                  samples={samples}
                  handleSelectSample={this.handleSelectSample.bind(this)}
                />
              </div>
            ))}
          </fieldset>
        </div>

        <div style={{ maxWidth: "50%" }}>
          <fieldset>
            <legend>Step 2: Dilution</legend>
            Volume to transfer in a dilution series{" "}
            <input
              type="number"
              defaultValue={this.state.inputVolume}
              onInput={e => this.handleDilutionVolume(e)}
            />{" "}
            {dilutionFactor && <small>Dilution Factor: {dilutionFactor}</small>}
          </fieldset>

          <fieldset>
            <legend>Step 3.1: Select Plate</legend>
            <select onChange={e => this.handleSelectPlate(e)}>
              <option>Select...</option>
              {plates.map(i => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>{" "}
            {plate || ""}
          </fieldset>
        </div>

        <fieldset>
          <legend>Step 3.2: Primary Antibody Exposure & wash</legend>
          <div>
            Number of washes:{" "}
            {Array.isArray(phases.primaryWash)
              ? phases.primaryWash.filter(i => i).length
              : 0}
          </div>
          Primary Wash Residue: {roundPrecision(primaryWashResidue, 3)}
          <ul>
            {Array.isArray(phases.primaryWash) &&
              phases.primaryWash
                .filter(i => i)
                .map((i, idx) => (
                  <li key={idx}>
                    Wash {idx + 1} {timestampToMins(i)}
                  </li>
                ))}
          </ul>
        </fieldset>

        <fieldset>
          <legend>Step 4</legend>
          <label>
            <select
              onChange={e => this.handleSelectSecondaryAB(e.target.value)}
            >
              <option>select..</option>
              {Object.keys(secondAntibodies).map(k => (
                <option value={k} key={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {JSON.stringify(secondaryAntibody, null, 2)}
          <br />
          <input
            type="number"
            defaultValue={this.state.secondaryInputVolume}
            onInput={e => this.handleABConcentration(e)}
          />{" "}
          concentration: {this.state.secondaryConcentration}
        </fieldset>

        <hr />

        <div style={{ maxWidth: "100%" }}>
          <ResultTable values={dilutionResults} title="Dilutions" />
        </div>

        <div style={{ maxWidth: "100%" }}>
          <ResultTable values={primaryResults} title="Primary Exposure" />
        </div>

        <div style={{ maxWidth: "100%" }}>
          <ResultTable values={secondaryResults} title="Secondary Exposure" />
        </div>

        <div style={{ maxWidth: "50%" }}>
          <div className="logger" ref={me => (this.logRef = me)}>
            {log.map((step, i) => (
              <div key={`step-${i}`}>{step.message}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }
}

export default App;
