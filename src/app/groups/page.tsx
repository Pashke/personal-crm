import type { Metadata } from "next";

import { deleteGroup, renameGroup } from "@/app/groups/actions";
import { BackLink } from "@/components/back-link";
import { GroupRow } from "@/components/group-row";
import { NewGroupForm } from "@/components/new-group-form";
import { homeHref } from "@/lib/home-href";
import { listGroups } from "@/lib/groups";

export const metadata: Metadata = { title: "Группы" };

export default async function GroupsPage() {
  const groups = await listGroups();

  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="font-display text-title font-bold uppercase">Группы</h1>

      <NewGroupForm />

      {groups.length === 0 ? (
        <p className="font-hand text-note font-medium text-accent">Групп пока нет</p>
      ) : (
        <ul className="border-t-2 border-accent">
          {groups.map((group) => (
            <GroupRow
              key={group.id}
              name={group.name}
              contactCount={group.contactCount}
              href={homeHref({ groupId: group.id })}
              rename={renameGroup.bind(null, group.id)}
              remove={deleteGroup.bind(null, group.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
