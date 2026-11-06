import { act, fireEvent } from "@testing-library/react";

/** Minimal stand-in for @testing-library/user-event (not installed), built on fireEvent. */
const user = {
  async click(element: Element) {
    await act(async () => {
      fireEvent.click(element);
    });
  },
  async type(element: Element, text: string) {
    await act(async () => {
      fireEvent.change(element, { target: { value: text } });
    });
  },
};

export default user;
