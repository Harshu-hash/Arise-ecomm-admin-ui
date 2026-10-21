import { glossify } from '@shared/utils/glossify';

/** JSX wrapper for `glossify`, for call sites that read better as a component than a function call. */
export default function GlossaryText({ children }) {
  return glossify(children);
}
