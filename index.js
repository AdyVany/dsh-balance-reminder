/**
 * Host half of dsh-balance-reminder.
 *
 * The whole experience lives in the Client half: a bottom status bar that
 * polls the signed-in DeepSeek Platform wallet and a low-balance reminder
 * card. No Host state is needed, so this module only participates in the
 * bundle patch; its presence in the Loader is what makes the Client module
 * registry serve `./client`.
 */
export function apply() {}
