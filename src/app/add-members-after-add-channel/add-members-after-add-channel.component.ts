import { Component, inject, Inject, ViewChild, ElementRef } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Channel } from '../../models/channel.class';
import { ChannelsService } from '../../services/content/channels.service';
import { User } from '../../models/user.class';
import { UsersService } from '../../services/users.service';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-add-members-after-add-channel',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './add-members-after-add-channel.component.html',
  styleUrl: './add-members-after-add-channel.component.scss'
})
export class AddMembersAfterAddChannelComponent {
  selection: 'allMembers' | 'specificPeople' | null = null;
  specificPeopleSearch: string = '';
  filteredUsers: User[] = [];
  showUserList: boolean = false;
  selectedUser: User | null = null;
  specificPeopleSelected: User[] = [];
  @ViewChild('specificPeopleInput', { read: ElementRef }) specificPeopleInput!: ElementRef<HTMLInputElement>;
  private channelsService = inject(ChannelsService);
  private usersService = inject(UsersService);

  constructor(
    private dialogRef: MatDialogRef<AddMembersAfterAddChannelComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Channel,
  ) { }

  redirectToChannel() {
    this.channelsService.addChannelToRoute('main-chat', this.data.channel_id);
  }

  onSearch(): void {
    if (this.specificPeopleSearch.length > 0) {
      const term = this.specificPeopleSearch.toLowerCase();
      this.filteredUsers = this.usersService
        .getAllUsers()
        .filter((u: User) => u.name.toLowerCase().includes(term));
      this.showUserList = true;
    } else {
      this.filteredUsers = [];
      this.showUserList = false;
    }
  }

  selectUser(user: User): void {
    this.selectedUser = user;
    this.showUserList = false;
    this.specificPeopleSearch = '';
    this.autofocus();
  }

  clearSelection(): void {
    this.selectedUser = null;
    this.specificPeopleSearch = '';
  }

  async onSubmit(form: NgForm) {
    if (this.selection === 'allMembers') {
      this.data.members = this.usersService.users;
      await this.channelsService.updateChannel(this.data)
        .then(() => this.redirectToChannel());
    } else {
      console.log(this.specificPeopleSelected);
    }
  }

  autofocus() {
    setTimeout(() => this.specificPeopleInput.nativeElement.focus(), 40);
  }

  close() {
    this.redirectToChannel();
    this.dialogRef.close();
  }
}
