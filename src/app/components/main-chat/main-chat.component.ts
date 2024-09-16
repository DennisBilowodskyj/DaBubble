import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { CommonModule } from '@angular/common';
import { MessageItemComponent } from '../message-item/message-item.component';
import { MessageBoxComponent } from '../message-box/message-box.component';
import { TimeSeparatorComponent } from '../time-separator/time-separator.component';
import { ChannelsService } from '../../../services/content/channels.service';
import { Channel } from '../../../models/channel.class';
import { EditChannelComponent } from '../../edit-channel/edit-channel.component';
import { MatDialog } from '@angular/material/dialog';
import { ThreadComponent } from '../thread/thread.component';
import { Subscription } from 'rxjs';
import { Post } from '../../../models/post.class';
import { AuthService } from '../../../services/auth.service';
import { TimeService } from '../../../services/time.service';
import { User } from '../../../models/user.class';
import { MemberListComponent } from '../../member-list/member-list.component';
import { ActivityService } from '../../../services/activity.service';
import { UsersService } from '../../../services/users.service';
import { AddMembersComponent } from '../../add-members/add-members.component';
import { ForbiddenChannelFeedbackComponent } from './forbidden-channel-feedback/forbidden-channel-feedback.component';
import { MembersOverviewComponent } from './members-overview/members-overview.component';
import { NavigationComponent } from '../navigation/navigation.component';

@Component({
  selector: 'app-main-chat',
  standalone: true,
  templateUrl: './main-chat.component.html',
  styleUrls: ['./main-chat.component.scss'],
  imports: [
    CommonModule,
    PickerComponent,
    MessageItemComponent,
    MessageBoxComponent,
    TimeSeparatorComponent,
    ThreadComponent,
    ForbiddenChannelFeedbackComponent,
    MembersOverviewComponent
  ]
})
export class MainChatComponent implements OnInit, OnDestroy {
  private authSub!: Subscription;
  private channelSub!: Subscription;
  private scrollSub!: Subscription;
  private postsSub!: Subscription;
  isChannelOpen: boolean = true;
  @ViewChild(NavigationComponent) navigationComponent!: NavigationComponent;
  @ViewChild(MembersOverviewComponent) membersOverviewComponent!: MembersOverviewComponent;
  currentUid: string | undefined;
  currentChannel = new Channel();
  currentChannelAuthorName?: string;
  currPost: Post | undefined;
  openTh = false;
  emojiPicker = false;
  activeUsers: User[] = [];
  currentDate: number = Date.now();
  onInvalidOrForbiddenRoute: boolean = false;
  @ViewChildren(MessageItemComponent, { read: ElementRef }) messageItems!: QueryList<ElementRef>;
  savedPostsLength: number | null = null;
  channelMembersDataUpdated: boolean = false;

  constructor(
    private dialog: MatDialog,
    private authService: AuthService,
    private usersService: UsersService,
    private channelsService: ChannelsService,
    private activityService: ActivityService,
    public timeService: TimeService,
    private router: Router,
    private route: ActivatedRoute,
  ) { }

  ngOnInit(): void {
    this.authSub = this.authService.user$.subscribe(() => this.currentUid = this.authService.getCurrentUid());

    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.initChannel(id);
        this.closeThread(false);
      }
    });

    this.channelSub = this.channelsService.channels$.subscribe(() => {
      if (this.currentChannel.channel_id) {
        this.setChannel(this.currentChannel.channel_id);
      }
    });
  }

  toggleChannel(): void {
    this.isChannelOpen = !this.isChannelOpen;
  }

  ngOnDestroy(): void {
    this.authSub.unsubscribe();
    this.channelSub.unsubscribe();
    this.scrollSub.unsubscribe();
  }

  initChannel(channel_id: string): void {
    if (this.currentChannel.channel_id.length === 0) {
      this.currentChannel.channel_id = channel_id;
    }
    this.setChannel(channel_id);
  }

  setChannel(channel_id: string): void {
    const channel = this.channelsService.channels.find(c => c.channel_id === channel_id);
    if (channel && this.currentUid && channel.members.some(m => m.uid === this.currentUid)) {
      this.onInvalidOrForbiddenRoute = false;
      this.currentChannel = channel;
      this.currentChannelAuthorName = this.usersService.getUserByUid(this.currentChannel.author_uid)?.name;
      this.activeUsers = this.activityService.getActiveUsers();
      if (window.innerWidth <= 768) {
        this.isChannelOpen = true;
      }
      this.updateChannelMembersData();
      this.scrollSub = this.route.queryParams.subscribe(params => {
        setTimeout(() => this.goToPost(params['post']), 20);
      });
    } else { this.onInvalidOrForbiddenRoute = true };
  }

  updateChannelMembersData(): void {
    if (!this.channelMembersDataUpdated) {
      this.channelMembersDataUpdated = true;
      const usersSub: Subscription = this.usersService.users$.subscribe(async () => {
        this.updateChannelMembersDataInRuntime();
        usersSub.unsubscribe();
        await this.channelsService.updateChannel(this.currentChannel);
      });
    }
  }

  updateChannelMembersDataInRuntime(): void {
    for (let i = this.currentChannel.members.length - 1; i >= 0; i--) {
      let m: User = this.currentChannel.members[i];
      const updatedUser: User | undefined = this.usersService.getUserByUid(m.uid);
      if (updatedUser) { this.currentChannel.members[i] = updatedUser }
      else {this.currentChannel.members.splice(i, 1)}
    };
  }

  goToPost(postId: string | undefined) {
    this.postsSub = this.messageItems.changes.subscribe((elements: QueryList<ElementRef>) => {
      if (this.hasPostLengthChanged(elements)) {
        (postId && postId.length > 0) ? this.handlePostAndThreadScrolling(elements, postId) : this.autoscrollToLastPost(elements);
      }
    });
    this.messageItems.notifyOnChanges();
  }

  hasPostLengthChanged(elements: QueryList<ElementRef>): boolean {
    const currentLength = elements.toArray().length;
    if (currentLength != this.savedPostsLength) {
      this.savedPostsLength = currentLength;
      return true;
    } else {
      return false;
    }
  }

  handlePostAndThreadScrolling(elements: QueryList<ElementRef>, postId: string) {
    const postRef = elements.find(el => el.nativeElement.id === postId);
    if (postRef) {
      this.autoscrollToPost(postRef);
    } else if (this.channelsService.isPostInThread(this.currentChannel, postId)) {
      this.openThreadAndAutoscrollToFirstPost(elements, postId);
    }
  }

  autoscrollToPost(postRef: ElementRef<any>) {
    this.postsSub.unsubscribe();
    postRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
    this.router.navigate([], {
      queryParams: { 'post': null },
      queryParamsHandling: 'merge'
    });
  }

  autoscrollToLastPost(elements: QueryList<ElementRef>) {
    const array = elements.toArray();
    const postRef = array.pop();
    if (postRef) { postRef.nativeElement.scrollIntoView({}); }
  }

  openThreadAndAutoscrollToFirstPost(elements: QueryList<ElementRef>, postId: string) {
    const { postInThread, thread_id } = this.channelsService.getPostInThread(this.currentChannel, postId);
    if (thread_id.length > 0) {
      const firstPost: Post | undefined = this.currentChannel.posts.find(p => p.thread.thread_id === thread_id);
      const firstPostRef = elements.find(el => el.nativeElement.id === firstPost?.post_id);
      firstPostRef?.nativeElement.scrollIntoView();
      this.handleThread(thread_id);
    }
  }

  isCurrentUserAuthor(index: number): boolean {
    const firstPost = this.currentChannel.posts[index];
    return this.currentUid === firstPost.user_id;
  }

  getPostUid(index: number) {
    const currentPost = this.currentChannel.posts[index];
    return currentPost.user_id;
  }

  onCreatePost(data: any): void {
    if (!this.currentUid || !this.currentChannel.channel_id) {
      console.error('User ID or channel ID is not set.');
      return;
    }

    this.channelsService.addPostToChannel(this.currentChannel.channel_id, this.currentUid, data.message, data.attachmentSrc)
      .then(() => console.log('Post successfully added to the channel'))
      .catch(err => console.error('Error adding post to the channel:', err));
  }

  onEditChannel(): void {
    this.dialog.open(EditChannelComponent, { panelClass: "dialog-all-corner-30", data: this.currentChannel });
  }

  openAddMembers(): void {
    if (window.innerWidth <= 768) {
      this.callOpenMemberList();
    } else {
      if (this.openTh) {
        const dialogRef = this.dialog.open(AddMembersComponent, {
          data: { channelMembers: this.currentChannel.members, channel: this.currentChannel, isThreadOpen: this.openTh },
        });
      } else {
        const dialogRef = this.dialog.open(AddMembersComponent, {
          data: { channelMembers: this.currentChannel.members, channel: this.currentChannel }
        });
      }
    }
  }

  callOpenMemberList(): void {
    if (this.membersOverviewComponent) {
      this.membersOverviewComponent.openMemberList();
    } else {
      console.error('MembersOverviewComponent not found');
    }
  }

  handleThread(threadId: string): void {
    if (this.currentChannel && this.currentChannel.posts) {
      const post = this.currentChannel.posts.find(post => post.thread.thread_id === threadId);
      if (post) {
        this.currPost = post;
        this.openTh = true;
      } else {
        console.error(`Thread with ID ${threadId} not found.`);
        this.currPost = undefined;
      }
    } else {
      console.error('Current channel or posts are not defined.');
    }
  }

  closeThread(event: any) {
    this.openTh = event;
  }
}
