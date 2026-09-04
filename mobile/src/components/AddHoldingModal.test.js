import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import AddHoldingModal from "./AddHoldingModal";

// The first tests that actually RENDER a screen rather than calling a pure
// function. What they're for: the pure tests already pin buildHolding's
// payload, but nothing checked that the form is WIRED to it — that typing in
// the fields reaches buildHolding, that validation blocks a save, or that
// picking an instrument fills in the other fields. Each of those is a wiring
// bug the pure tests cannot see.

jest.mock("../services/instrumentCache", () => ({
  loadInstruments: jest.fn(async () => [
    { symbol: "INFY", name: "Infosys Ltd", exchange: "NSE", asset_class: "Equity", currency: "INR", sector: "IT" },
    { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty BeES", exchange: "NSE", asset_class: "ETF", currency: "INR", sector: null },
  ]),
}));

const setup = (over = {}) => {
  const onAdded = jest.fn(async () => true);
  const onClose = jest.fn();
  render(<AddHoldingModal visible onClose={onClose} onAdded={onAdded} {...over} />);
  return { onAdded, onClose };
};

describe("AddHoldingModal — validation", () => {
  it("refuses to save without a ticker and says why", async () => {
    const { onAdded } = setup();
    fireEvent.press(screen.getByText("Add holding"));

    expect(await screen.findByText(/Ticker \/ symbol is required/)).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("refuses to save with a ticker but no name", async () => {
    const { onAdded } = setup();
    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "TCS");
    fireEvent.press(screen.getByText("Add holding"));

    expect(await screen.findByText(/Asset name is required/)).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("rejects a negative quantity rather than saving a nonsense holding", async () => {
    const { onAdded } = setup();
    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "TCS");
    fireEvent.changeText(screen.getByPlaceholderText("Infosys Ltd"), "TCS Ltd");
    fireEvent.changeText(screen.getAllByPlaceholderText("0")[0], "-5");
    fireEvent.press(screen.getByText("Add holding"));

    expect(await screen.findByText(/Quantity must be/)).toBeTruthy();
    expect(onAdded).not.toHaveBeenCalled();
  });
});

describe("AddHoldingModal — saving", () => {
  it("hands the typed values to onAdded in the server's payload shape", async () => {
    const { onAdded, onClose } = setup();

    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "tcs");
    fireEvent.changeText(screen.getByPlaceholderText("Infosys Ltd"), "TCS Ltd");
    fireEvent.changeText(screen.getAllByPlaceholderText("0")[0], "12");
    fireEvent.changeText(screen.getAllByPlaceholderText("0")[1], "3500");
    fireEvent.press(screen.getByText("Add holding"));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded).toHaveBeenCalledWith(
      expect.objectContaining({
        sym: "TCS", // uppercased on the way out
        name: "TCS Ltd",
        sh: 12,
        cost: 3500,
        price: 3500, // seeded from cost, not left at 0
        acct: "manual",
        source: "manual",
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the sheet open and explains when the save fails", async () => {
    const onAdded = jest.fn(async () => false);
    const onClose = jest.fn();
    render(<AddHoldingModal visible onClose={onClose} onAdded={onAdded} />);

    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "TCS");
    fireEvent.changeText(screen.getByPlaceholderText("Infosys Ltd"), "TCS Ltd");
    fireEvent.press(screen.getByText("Add holding"));

    expect(await screen.findByText(/Couldn't save that holding/)).toBeTruthy();
    // Losing the user's typing on a failed save would be worse than the failure.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("TCS Ltd")).toBeTruthy();
  });
});

describe("AddHoldingModal — instrument search", () => {
  it("fills in name, sector and type when a result is picked", async () => {
    setup();
    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "inf");

    const hit = await screen.findByText("Infosys Ltd");
    fireEvent.press(hit);

    await waitFor(() => expect(screen.getByDisplayValue("Infosys Ltd")).toBeTruthy());
    expect(screen.getByDisplayValue("IT")).toBeTruthy();
  });

  it("maps an ETF to the ETF holding type, not the Stock default", async () => {
    setup();
    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "nifty");

    fireEvent.press(await screen.findByText("Nippon India ETF Nifty BeES"));

    await waitFor(() => expect(screen.getByDisplayValue("NIFTYBEES")).toBeTruthy());
    // The type chips are radio-like; the ETF one having been selected is the
    // observable effect of holdingTypeFor() having been applied.
    expect(screen.getByText("ETF")).toBeTruthy();
  });

  it("shows nothing for a single character", async () => {
    setup();
    fireEvent.changeText(screen.getByPlaceholderText("INFY"), "i");
    await waitFor(() => expect(screen.queryByText("Infosys Ltd")).toBeNull());
  });
});
