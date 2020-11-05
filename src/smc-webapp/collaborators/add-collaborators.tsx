/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Add collaborators to a project
*/

import { Input, Select } from "antd";

import {
  React,
  redux,
  useActions,
  useTypedRedux,
  useState,
} from "../app-framework";

import { Alert, Button, ButtonToolbar, Well } from "../antd-bootstrap";

import {
  Icon,
  LabeledRow,
  Loading,
  MarkdownInput,
  SearchInput,
  ErrorDisplay,
} from "../r_misc";

import { webapp_client } from "../webapp-client";
import { has_internet_access } from "../upgrades/upgrade-utils";
import { SITE_NAME } from "smc-util/theme";
import { contains_url } from "smc-util/misc2";
import { search_match, search_split } from "smc-util/misc";
import { Project } from "../projects/store";

interface User {
  account_id: string;
  first_name: string;
  last_name: string;
  last_active?: Date;
  created?: Date;
  email_address?: string;
  email_address_verified?: boolean;
}

interface Props {
  project: Project;
  inline?: boolean;
  allow_urls?: boolean;
}

type State = "input" | "searching" | "searched";

export const AddCollaborators: React.FC<Props> = ({
  project,
  inline,
  allow_urls,
}) => {
  const user_map = useTypedRedux("users", "user_map");

  // search that user has typed in so far
  const [search, set_search] = useState<string>("");

  // list of results for doing the search -- turned into a selector
  const [results, set_results] = useState<User[]>([]);

  // list of actually selected entries in the selector list
  const [selected_entries, set_selected_entries] = useState<string[]>([]);

  // currently carrying out a search
  const [state, set_state] = useState<State>("input");
  // display an error in case something went wrong doing a search
  const [err, set_err] = useState<string>("");
  // if set, adding user via email to this address
  const [email_to, set_email_to] = useState<string>("");
  // with this body.
  const [email_body, set_email_body] = useState<string>("");
  const [email_body_error, set_email_body_error] = useState<string>("");
  const [email_body_editing, set_email_body_editing] = useState<boolean>(false);

  const project_actions = useActions("projects");

  function reset(): void {
    set_search("");
    set_results([]);
    set_selected_entries([]);
    set_state("input");
    set_err("");
    set_email_to("");
    set_email_body("");
    set_email_body_error("");
    set_email_body_editing(false);
  }

  async function do_search(search: string): Promise<void> {
    search = search.trim();
    // this gets used in write_email_invite, and whether to render the selection list.
    set_search(search);
    set_selected_entries([]);
    if (state == "searching") {
      // already searching
      return;
    }
    if (search.length === 0) {
      set_err("");
      set_results([]);
      return;
    }
    set_state("searching");
    let err = "";
    let results;
    try {
      results = await webapp_client.users_client.user_search({
        query: search,
        limit: 50,
      });
    } catch (e) {
      err = e.toString();
    }
    write_email_invite();

    set_state("searched");
    set_err(err);
    set_results(results);
    set_email_to("");
  }

  function render_options(users: User[]): JSX.Element[] {
    // We put the collaborators at the top of the list of search results.
    let v: User[] = [];
    if (user_map != null) {
      const x: User[] = [];
      const y: User[] = [];
      for (const r of users) {
        if (user_map.get(r.account_id)) {
          x.push(r);
        } else {
          y.push(r);
        }
      }
      v = x.concat(y);
    }

    const options: JSX.Element[] = [];
    for (const r of v) {
      let name = r.first_name + " " + r.last_name;

      // Extra display is a bit ugly, but we need to do it for now.  Need to make
      // react rendered version of this that is much nicer (with pictures!) someday.
      const extra: string[] = [];
      if (user_map?.get(r.account_id)) {
        extra.push("Collaborator");
      }
      if (r.last_active) {
        extra.push(
          `Last active: ${new Date(r.last_active).toLocaleDateString()}`
        );
      }
      if (r.created) {
        extra.push(`Created: ${new Date(r.created).toLocaleDateString()}`);
      }
      if (r.email_address) {
        if (r.email_address_verified?.[r.email_address]) {
          extra.push("Email verified: YES");
        } else {
          extra.push("Email verified: NO");
        }
      }
      if (extra.length > 0) {
        name += `  (${extra.join(", ")})`;
      }
      options.push(
        <Select.Option
          key={r.account_id}
          value={r.account_id}
          label={name.toLowerCase()}
        >
          {name}
        </Select.Option>
      );
    }
    return options;
  }

  function invite_collaborator(account_id: string): void {
    const replyto = redux.getStore("account").get_email_address();
    const replyto_name = redux.getStore("account").get_fullname();
    const SiteName = redux.getStore("customize").get("site_name") ?? SITE_NAME;
    let subject;
    if (replyto_name != null) {
      subject = `${replyto_name} added you to ${SiteName} project ${project.get(
        "title"
      )}`;
    } else {
      subject = `You've been added to ${SiteName} project ${project.get(
        "title"
      )}`;
    }
    project_actions.invite_collaborator(
      project.get("project_id"),
      account_id,
      email_body,
      subject,
      false,
      replyto,
      replyto_name
    );
  }

  function add_selected(): void {
    // handle case, where just one name is listed → clicking on
    // "add" would clear everything w/o inviting
    if (selected_entries.length > 0 && results.length == 1) {
      invite_collaborator(results[0].account_id);
    } else {
      for (const account_id of selected_entries) {
        invite_collaborator(account_id);
      }
    }
    reset();
  }

  function write_email_invite(): void {
    const name = redux.getStore("account").get_fullname();
    const title = project.get("title");
    const target = `project '${title}'`;
    const SiteName = redux.getStore("customize").get("site_name") ?? SITE_NAME;
    const body = `Hello!\n\nPlease collaborate with me using ${SiteName} on ${target}.\n\nBest wishes,\n\n${name}`;
    set_email_to(search);
    set_email_body(body);
  }

  function send_email_invite(): void {
    const replyto = redux.getStore("account").get_email_address();
    const replyto_name = redux.getStore("account").get_fullname();
    const SiteName = redux.getStore("customize").get("site_name") ?? SITE_NAME;
    let subject;
    if (replyto_name != null) {
      subject = `${replyto_name} added you to project ${project.get("title")}`;
    } else {
      subject = `${SiteName} Invitation to project ${project.get("title")}`;
    }
    project_actions.invite_collaborators_by_email(
      project.get("project_id"),
      email_to,
      email_body,
      subject,
      false,
      replyto,
      replyto_name
    );
    set_email_to("");
    set_email_body("");
    reset();
  }

  function check_email_body(value: string): void {
    if (!allow_urls && contains_url(value)) {
      set_email_body_error("Sending URLs is not allowed. (anti-spam measure)");
    } else {
      set_email_body_error("");
    }
  }

  function render_email_body_error(): JSX.Element | undefined {
    if (!email_body_error) {
      return;
    }
    return <ErrorDisplay error={email_body_error} />;
  }

  function on_cancel(): void {
    set_email_body_editing(false);
    set_email_body_error("");
  }

  function render_send_email(): JSX.Element | undefined {
    if (!email_to) {
      return;
    }

    return (
      <div>
        <hr />
        <Well>
          Enter one or more email addresses separated by commas:
          <Input
            placeholder="Email addresses separated by commas..."
            value={email_to}
            onChange={(e) => set_email_to((e.target as any).value)}
            autoFocus
          />
          <div
            style={{
              border: "1px solid lightgrey",
              padding: "10px",
              borderRadius: "5px",
              backgroundColor: "white",
              marginBottom: "15px",
            }}
          >
            {render_email_body_error()}
            <MarkdownInput
              default_value={email_body}
              rows={8}
              on_save={(value) => {
                set_email_body(value);
                set_email_body_editing(false);
              }}
              on_cancel={on_cancel}
              on_edit={() => set_email_body_editing(true)}
              save_disabled={email_body_error !== null}
              on_change={check_email_body}
            />
          </div>
          <ButtonToolbar>
            <Button
              bsStyle="primary"
              onClick={send_email_invite}
              disabled={!!email_body_editing}
            >
              Send Invitation
            </Button>
            <Button
              onClick={() => {
                set_email_to("");
                set_email_body("");
                set_email_body_editing(false);
              }}
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Well>
      </div>
    );
  }

  function render_search(): JSX.Element | undefined {
    /* TODO: we should not say 'search for "h"' when someone
       has already searched for "h".
       Instead it should be:
       - Search [...]
       - if results.length > 0:
         - Select names from below to add
         - list of users
         - add button
       - else
         - no results found
         - send invitation
    */
    if (search && state == "searched") {
      return (
        <div style={{ marginBottom: "10px" }}>
          {render_select_list_button()}
        </div>
      );
    }
  }

  function render_send_email_invite(): JSX.Element {
    if (has_internet_access(project.get("project_id"))) {
      return (
        <Button style={{ marginBottom: "10px" }} onClick={write_email_invite}>
          <Icon name="envelope" /> Send Email Invitation...
        </Button>
      );
    } else {
      return (
        <div>
          Enable the Internet Access upgrade to this project in project settings
          in order to send an email invitation.
        </div>
      );
    }
  }

  function render_select_list(): JSX.Element | undefined {
    if (state == "searching") {
      return <Loading />;
    }
    if (err) {
      return <ErrorDisplay error={err} onClose={() => set_err("")} />;
    }
    if (results.length == 0 || !search.trim()) {
      return;
    }
    const users: User[] = [];
    const existing: User[] = [];
    for (const r of results) {
      if (project.get("users").get(r.account_id) != null) {
        existing.push(r);
      } else {
        users.push(r);
      }
    }
    if (results.length === 0) {
      if (existing.length === 0) {
        return (
          <>
            Sorry, no accounts found.
            <br />
            {render_send_email_invite()}
          </>
        );
      } else {
        // no hit, but at least one existing collaborator
        const v: any = [];
        for (const { first_name, last_name } of existing) {
          v.push(`${first_name} ${last_name}`);
        }
        const collabs = v.join(", ");
        return (
          <Alert bsStyle="info">Existing collaborator(s): {collabs}</Alert>
        );
      }
    } else {
      return (
        <div style={{ marginBottom: "10px" }}>
          <Select
            mode="multiple"
            allowClear
            showArrow
            autoFocus
            defaultOpen
            filterOption={(s, opt) => {
              return search_match(
                (opt as any).label,
                search_split(s.toLowerCase())
              );
            }}
            style={{ width: "100%" }}
            placeholder="Select users..."
            onChange={(value) => {
              set_selected_entries(value as string[]);
            }}
          >
            {render_options(users)}
          </Select>
          {selected_entries.length > 0 && (
            <div
              style={{
                border: "1px solid lightgrey",
                padding: "10px",
                borderRadius: "5px",
                backgroundColor: "white",
                margin: "15px 0",
              }}
            >
              {render_email_body_error()}
              <MarkdownInput
                default_value={email_body}
                rows={8}
                on_save={(value) => {
                  set_email_body(value);
                  set_email_body_editing(false);
                }}
                on_cancel={on_cancel}
                on_edit={() => set_email_body_editing(true)}
                save_disabled={email_body_error !== null}
                on_change={check_email_body}
              />
            </div>
          )}
          {render_select_list_button()}
        </div>
      );
    }
  }

  function render_select_list_button(): JSX.Element | undefined {
    const number_selected = selected_entries.length;
    const btn_text = (() => {
      switch (results.length) {
        case 0:
          return "No User Found";
        case 1:
          return "Add User";
        default:
          switch (number_selected) {
            case 0:
              return undefined;
            case 1:
              return "Add Selected User";
            default:
              return `Add ${number_selected} Users`;
          }
      }
    })();
    const disabled =
      results.length === 0 || (results.length >= 2 && number_selected === 0);
    if (btn_text === undefined) {
      return;
    }
    return (
      <Button onClick={add_selected} disabled={disabled} bsStyle="primary">
        <Icon name="user-plus" /> {btn_text}
      </Button>
    );
  }

  function render_input_row(): JSX.Element | undefined {
    const input = (
      <SearchInput
        on_submit={do_search}
        value={search}
        placeholder="Search by name or email address..."
        on_change={(value) => {
          set_results([]);
          set_search(value);
        }}
        on_clear={reset}
      />
    );
    if (inline) {
      return input;
    } else {
      const label = (
        <div
          style={{
            fontSize: "12pt",
            marginTop: "6px",
            color: "#666",
            marginLeft: "15px",
          }}
        >
          Search
        </div>
      );
      return <LabeledRow label={label}>{input}</LabeledRow>;
    }
  }

  return (
    <div>
      {render_input_row()}
      {render_search()}
      {render_select_list()}
      {render_send_email()}
    </div>
  );
};
